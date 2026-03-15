package collector

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// IncidentTriggerConfig defines severity and type for a Kubernetes event reason.
type IncidentTriggerConfig struct {
	Type     string // e.g., "crash_loop", "oom_kill", "image_pull_failure"
	Severity string // "critical", "high", "medium", "low"
}

// INCIDENT_TRIGGERS maps K8s event Reasons to incident types.
// Only these reasons are treated as incidents — everything else is informational.
var INCIDENT_TRIGGERS = map[string]IncidentTriggerConfig{
	"BackOff":            {Type: "crash_loop", Severity: "critical"},
	"OOMKilling":         {Type: "oom_kill", Severity: "critical"},
	"OOMKilled":          {Type: "oom_kill", Severity: "critical"},
	"Failed":             {Type: "pod_failure", Severity: "high"},
	"FailedScheduling":   {Type: "scheduling_failure", Severity: "high"},
	"Unhealthy":          {Type: "health_check_failure", Severity: "high"},
	"ErrImagePull":       {Type: "image_pull_failure", Severity: "medium"},
	"ImagePullBackOff":   {Type: "image_pull_failure", Severity: "medium"},
	"FailedMount":        {Type: "volume_mount_failure", Severity: "medium"},
	"EvictedByVTAPlugin": {Type: "eviction", Severity: "medium"},
	"Evicted":            {Type: "eviction", Severity: "medium"},
}

// IncidentBundle contains all context for a detected incident.
type IncidentBundle struct {
	ClusterID        string    `json:"cluster_id"`
	TriggerType      string    `json:"trigger_type"`
	AffectedResource string    `json:"affected_resource"`
	Namespace        string    `json:"namespace"`
	Severity         string    `json:"severity"`
	Message          string    `json:"message"`
	DetectedAt       time.Time `json:"detected_at"`
}

// incidentKey is the deduplication key for an incident.
type incidentKey struct {
	Pod       string
	Namespace string
	Reason    string
}

// IncidentBuffer tracks recently reported incidents for deduplication.
type IncidentBuffer struct {
	mu     sync.Mutex
	recent map[incidentKey]time.Time
	window time.Duration
}

// NewIncidentBuffer creates a buffer with the given deduplication window.
func NewIncidentBuffer(window time.Duration) *IncidentBuffer {
	return &IncidentBuffer{
		recent: make(map[incidentKey]time.Time),
		window: window,
	}
}

// ShouldReport returns true if this incident has not been reported within the dedup window.
func (b *IncidentBuffer) ShouldReport(key incidentKey) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	last, exists := b.recent[key]
	if exists && time.Since(last) < b.window {
		return false
	}

	b.recent[key] = time.Now()
	return true
}

// CleanExpired removes entries older than the dedup window to prevent unbounded growth.
func (b *IncidentBuffer) CleanExpired() {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	for key, ts := range b.recent {
		if now.Sub(ts) > b.window {
			delete(b.recent, key)
		}
	}
}

// EventWatcher monitors Kubernetes events and emits incident bundles
// for known failure reasons, with deduplication.
type EventWatcher struct {
	k8sClient *kubernetes.Clientset
	clusterID string
	buffer    *IncidentBuffer
}

// NewEventWatcher creates a watcher with a 5-minute deduplication window.
func NewEventWatcher(client *kubernetes.Clientset, clusterID string) *EventWatcher {
	return &EventWatcher{
		k8sClient: client,
		clusterID: clusterID,
		buffer:    NewIncidentBuffer(5 * time.Minute),
	}
}

// Watch starts listening for Kubernetes events and sends incidents to the channel.
// Blocks until ctx is cancelled.
func (w *EventWatcher) Watch(ctx context.Context, incidentCh chan<- IncidentBundle) {
	factory := informers.NewSharedInformerFactory(w.k8sClient, 0)
	eventInformer := factory.Core().V1().Events().Informer()

	eventInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			event, ok := obj.(*corev1.Event)
			if !ok {
				return
			}

			triggerConfig, isTrigger := INCIDENT_TRIGGERS[event.Reason]
			if !isTrigger {
				return
			}

			if systemNamespaces[event.InvolvedObject.Namespace] {
				return
			}

			key := incidentKey{
				Pod:       event.InvolvedObject.Name,
				Namespace: event.InvolvedObject.Namespace,
				Reason:    event.Reason,
			}
			if !w.buffer.ShouldReport(key) {
				return
			}

			bundle := IncidentBundle{
				ClusterID:        w.clusterID,
				TriggerType:      triggerConfig.Type,
				AffectedResource: event.InvolvedObject.Name,
				Namespace:        event.InvolvedObject.Namespace,
				Severity:         triggerConfig.Severity,
				Message:          event.Message,
				DetectedAt:       time.Now(),
			}

			select {
			case incidentCh <- bundle:
				log.Printf("[Events] Incident detected: %s/%s — %s (%s)",
					bundle.Namespace, bundle.AffectedResource, bundle.TriggerType, bundle.Severity)
			default:
				log.Printf("[Events] Incident channel full — dropping: %s/%s %s",
					bundle.Namespace, bundle.AffectedResource, bundle.TriggerType)
			}
		},
	})

	// Periodic cleanup of expired dedup entries
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				w.buffer.CleanExpired()
			}
		}
	}()

	factory.Start(ctx.Done())
	factory.WaitForCacheSync(ctx.Done())

	log.Println("[Events] Watcher started — monitoring for incidents")
	<-ctx.Done()
}

// DrainAndSend reads incidents from the channel and sends them via the callback.
func DrainAndSend(ctx context.Context, ch <-chan IncidentBundle, send func(IncidentBundle) error) {
	for {
		select {
		case <-ctx.Done():
			return
		case incident := <-ch:
			if err := send(incident); err != nil {
				log.Printf("[Events] Failed to send incident: %v", err)
			} else {
				log.Printf("[Events] Incident reported: %s in %s/%s",
					incident.TriggerType, incident.Namespace, incident.AffectedResource)
			}
		}
	}
}

// FormatIncident provides a human-readable summary for logging.
func FormatIncident(b IncidentBundle) string {
	return fmt.Sprintf("[%s] %s/%s: %s — %s",
		b.Severity, b.Namespace, b.AffectedResource, b.TriggerType, b.Message)
}
