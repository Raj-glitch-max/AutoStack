// Package main is the entrypoint for the AutoStack cluster agent.
// It wires together config, client, metrics, and event subsystems.
package main

import (
	"context"
	"encoding/json"
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
	cfg := config.Load()
	log.Printf("AutoStack Agent %s starting for cluster %s", cfg.AgentVersion, cfg.ClusterID)

	// Graceful shutdown on SIGINT/SIGTERM
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Initialize control plane client
	cpClient := client.New(cfg.ControlPlaneURL, cfg.ClusterID, cfg.AgentVersion)

	// Register: exchange one-time token for JWT
	jwt, err := cpClient.Register(ctx, cfg.AgentToken)
	if err != nil {
		log.Fatalf("Registration failed: %v", err)
	}
	log.Println("Registration successful — JWT obtained")
	_ = jwt // JWT is stored inside cpClient

	// Initialize Kubernetes client
	k8sConfig, err := rest.InClusterConfig()
	if err != nil {
		log.Fatalf("In-cluster K8s config failed: %v", err)
	}
	k8sClient, err := kubernetes.NewForConfig(k8sConfig)
	if err != nil {
		log.Fatalf("K8s client creation failed: %v", err)
	}

	// Start background JWT rotation
	go cpClient.RotateJWTLoop(ctx)

	// Start heartbeat loop
	go heartbeatLoop(ctx, cpClient, cfg)

	// Start metrics collector
	mc := collector.NewMetricsCollector(k8sClient)
	go mc.RunLoop(ctx, cfg.MetricsInterval, func(sample *collector.MetricsSample) error {
		payload := map[string]interface{}{
			"cluster_id": cfg.ClusterID,
			"type":       "telemetry",
			"data":       sample,
		}
		return cpClient.Send(ctx, "/agent-metrics", payload)
	})

	// Start event watcher with incident channel
	incidentCh := make(chan collector.IncidentBundle, 100)
	watcher := collector.NewEventWatcher(k8sClient, cfg.ClusterID)
	go watcher.Watch(ctx, incidentCh)

	// Drain incidents and send to control plane
	go collector.DrainAndSend(ctx, incidentCh, func(incident collector.IncidentBundle) error {
		payload := map[string]interface{}{
			"cluster_id": cfg.ClusterID,
			"type":       "incident",
			"data":       incident,
		}
		return cpClient.Send(ctx, "/agent-metrics", payload)
	})

	log.Println("All subsystems running — agent is operational")

	// Block until shutdown signal
	<-ctx.Done()
	log.Println("Shutdown signal received — exiting gracefully")
}

func heartbeatLoop(ctx context.Context, cpClient *client.Client, cfg *config.Config) {
	ticker := time.NewTicker(cfg.HeartbeatInterval)
	defer ticker.Stop()

	// Fire initial heartbeat immediately
	sendHeartbeat(ctx, cpClient, cfg)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sendHeartbeat(ctx, cpClient, cfg)
		}
	}
}

func sendHeartbeat(ctx context.Context, cpClient *client.Client, cfg *config.Config) {
	payload := map[string]interface{}{
		"cluster_id": cfg.ClusterID,
		"version":    cfg.AgentVersion,
		"timestamp":  time.Now().Format(time.RFC3339),
	}

	if err := cpClient.Send(ctx, "/agent-heartbeat", payload); err != nil {
		log.Printf("[Heartbeat] Failed: %v", err)
	}
}

// marshalJSON is a helper for consistent JSON encoding with error handling.
func marshalJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}
