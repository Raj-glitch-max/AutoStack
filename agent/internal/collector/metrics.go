// Package collector provides Kubernetes metrics collection and event watching.
package collector

import (
	"context"
	"fmt"
	"log"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// MetricsSample is a point-in-time snapshot of cluster resource usage.
type MetricsSample struct {
	CollectedAt    time.Time   `json:"collected_at"`
	ClusterCPUPct  float64     `json:"cpu_pct"`
	ClusterMemPct  float64     `json:"memory_pct"`
	TotalPodCount  int         `json:"pod_count"`
	TotalNodeCount int         `json:"node_count"`
	Pods           []PodMetric `json:"pods"`
}

// PodMetric contains resource usage for a single pod.
type PodMetric struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	CPUMillis    int64  `json:"cpu_millis"`
	MemoryBytes  int64  `json:"memory_bytes"`
	RestartCount int32  `json:"restart_count"`
	Phase        string `json:"phase"`
	Ready        bool   `json:"ready"`
}

// systemNamespaces are excluded from metrics collection — not user workloads.
var systemNamespaces = map[string]bool{
	"kube-system":       true,
	"kube-public":       true,
	"kube-node-lease":   true,
	"autostack-system":  true,
	"cert-manager":      true,
	"ingress-nginx":     true,
	"argocd":            true,
}

// MetricsCollector gathers real resource metrics from the Kubernetes cluster.
type MetricsCollector struct {
	k8sClient *kubernetes.Clientset
}

// NewMetricsCollector creates a collector with the given Kubernetes client.
func NewMetricsCollector(client *kubernetes.Clientset) *MetricsCollector {
	return &MetricsCollector{k8sClient: client}
}

// Collect gathers a point-in-time snapshot of cluster resource usage.
// Uses pod resource requests/limits and status rather than metrics-server
// to avoid a hard dependency on metrics-server being installed.
func (mc *MetricsCollector) Collect(ctx context.Context) (*MetricsSample, error) {
	sample := &MetricsSample{CollectedAt: time.Now()}

	// List all nodes
	nodes, err := mc.k8sClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("node list failed: %w", err)
	}
	sample.TotalNodeCount = len(nodes.Items)

	// Compute total cluster capacity from node allocatable resources
	var totalCPUCapacityMillis, totalMemCapacityBytes int64
	for i := range nodes.Items {
		alloc := nodes.Items[i].Status.Allocatable
		totalCPUCapacityMillis += alloc.Cpu().MilliValue()
		totalMemCapacityBytes += alloc.Memory().Value()
	}

	// List all pods
	pods, err := mc.k8sClient.CoreV1().Pods(corev1.NamespaceAll).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("pod list failed: %w", err)
	}
	sample.TotalPodCount = len(pods.Items)

	var totalCPUUsedMillis, totalMemUsedBytes int64

	for i := range pods.Items {
		pod := &pods.Items[i]

		if systemNamespaces[pod.Namespace] {
			continue
		}

		// Sum resource requests across all containers
		var cpuMillis, memBytes int64
		for j := range pod.Spec.Containers {
			requests := pod.Spec.Containers[j].Resources.Requests
			cpuMillis += requests.Cpu().MilliValue()
			memBytes += requests.Memory().Value()
		}

		var restartCount int32
		ready := true
		for _, cs := range pod.Status.ContainerStatuses {
			restartCount += cs.RestartCount
			if !cs.Ready {
				ready = false
			}
		}

		sample.Pods = append(sample.Pods, PodMetric{
			Name:         pod.Name,
			Namespace:    pod.Namespace,
			CPUMillis:    cpuMillis,
			MemoryBytes:  memBytes,
			RestartCount: restartCount,
			Phase:        string(pod.Status.Phase),
			Ready:        ready,
		})

		totalCPUUsedMillis += cpuMillis
		totalMemUsedBytes += memBytes
	}

	if totalCPUCapacityMillis > 0 {
		sample.ClusterCPUPct = float64(totalCPUUsedMillis) / float64(totalCPUCapacityMillis) * 100
	}
	if totalMemCapacityBytes > 0 {
		sample.ClusterMemPct = float64(totalMemUsedBytes) / float64(totalMemCapacityBytes) * 100
	}

	return sample, nil
}

// RunLoop periodically collects metrics and sends them via the provided callback.
// Blocks until ctx is cancelled.
func (mc *MetricsCollector) RunLoop(ctx context.Context, interval time.Duration, send func(*MetricsSample) error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sample, err := mc.Collect(ctx)
			if err != nil {
				log.Printf("[Metrics] Collection error: %v", err)
				continue
			}
			if err := send(sample); err != nil {
				log.Printf("[Metrics] Send error: %v", err)
			}
		}
	}
}
