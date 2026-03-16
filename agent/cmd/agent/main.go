// Package main is the entry point for the AutoStack Kubernetes agent.
//
// The agent runs inside the user's cluster and:
// 1. Registers with the control plane using a one-time token
// 2. Sends periodic heartbeats
// 3. Watches Kubernetes Warning events and reports incidents
// 4. Collects cluster metrics and workload inventory
//
// Required environment variables (set by Helm chart):
//   - AUTOSTACK_AGENT_TOKEN:       One-time registration token
//   - AUTOSTACK_CLUSTER_ID:        UUID of the cluster in AutoStack DB
//   - AUTOSTACK_CONTROL_PLANE_URL: Base URL of the control plane functions
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/raj-glitch-max/autostack/agent/internal/client"
	"github.com/raj-glitch-max/autostack/agent/internal/collector"
	"github.com/raj-glitch-max/autostack/agent/internal/config"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("[Agent] Starting AutoStack agent...")

	cfg := config.Load()

	// Initialize Kubernetes client (in-cluster config)
	k8sConfig, err := rest.InClusterConfig()
	if err != nil {
		log.Fatalf("[Agent] Failed to load in-cluster config: %v", err)
	}

	k8sClient, err := kubernetes.NewForConfig(k8sConfig)
	if err != nil {
		log.Fatalf("[Agent] Failed to create K8s client: %v", err)
	}

	// Create control plane HTTP client
	cpClient := client.New(cfg.ControlPlaneURL, cfg.ClusterID, cfg.AgentVersion)

	// Register with control plane using one-time token
	log.Println("[Agent] Registering with control plane...")
	jwt, err := cpClient.Register(context.Background(), cfg.AgentToken)
	if err != nil {
		log.Fatalf("[Agent] Registration failed: %v", err)
	}
	log.Println("[Agent] Registration successful")
	cpClient.SetJWT(jwt)

	// Graceful shutdown context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	// Goroutine 1: JWT rotation
	go cpClient.RotateJWTLoop(ctx)

	// Goroutine 2: Heartbeat
	go runHeartbeat(ctx, cpClient, cfg.HeartbeatInterval)

	// Goroutine 3: Event watcher → incident detection
	incidentCh := make(chan collector.IncidentBundle, 50)
	watcher := collector.NewEventWatcher(k8sClient, cfg.ClusterID)
	go watcher.Watch(ctx, incidentCh)
	go collector.DrainAndSend(ctx, incidentCh, func(incident collector.IncidentBundle) error {
		return cpClient.Send(ctx, "/agent-metrics", map[string]interface{}{
			"type":       "incident",
			"cluster_id": cfg.ClusterID,
			"incident":   incident,
		})
	})

	// Goroutine 4: Metrics collection
	metricsCollector := collector.NewMetricsCollector(k8sClient)
	go metricsCollector.RunLoop(ctx, cfg.MetricsInterval, func(sample *collector.MetricsSample) error {
		return cpClient.Send(ctx, "/agent-metrics", map[string]interface{}{
			"type":       "metrics",
			"cluster_id": cfg.ClusterID,
			"metrics":    sample,
		})
	})

	// Goroutine 5: Inventory collection (every 5 minutes)
	inventoryCollector := collector.NewInventoryCollector(k8sClient)
	go inventoryCollector.RunLoop(ctx, 5*time.Minute, func(inv *collector.InventorySnapshot) error {
		return cpClient.Send(ctx, "/agent-metrics", map[string]interface{}{
			"type":       "inventory",
			"cluster_id": cfg.ClusterID,
			"inventory":  inv,
		})
	})

	log.Println("[Agent] All goroutines started. Agent is running.")

	// Block until signal
	sig := <-sigCh
	log.Printf("[Agent] Received signal %v — shutting down gracefully...", sig)
	cancel()

	// Allow goroutines to wind down
	time.Sleep(2 * time.Second)
	log.Println("[Agent] Shutdown complete.")
}

func runHeartbeat(ctx context.Context, cpClient *client.Client, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			hostname, _ := os.Hostname()
			payload := map[string]interface{}{
				"hostname":    hostname,
				"timestamp":   time.Now().UTC().Format(time.RFC3339),
				"agent_version": "1.1.0",
			}
			data, _ := json.Marshal(payload)
			_ = data // Ensure no unused import

			if err := cpClient.Send(ctx, "/agent-heartbeat", payload); err != nil {
				log.Printf("[Heartbeat] Failed: %v", err)
			} else {
				fmt.Println("[Heartbeat] OK")
			}
		}
	}
}
