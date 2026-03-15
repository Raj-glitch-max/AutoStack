// Package config loads agent configuration from environment variables.
// Required variables cause a fatal exit if missing.
package config

import (
	"log"
	"os"
	"strconv"
	"time"
)

// Config holds the agent's runtime parameters.
// All required fields must be set via environment variables at startup.
type Config struct {
	// Required — set by Helm chart on install
	AgentToken      string        // One-time registration token from connect-cluster
	ClusterID       string        // UUID of the cluster in AutoStack DB
	ControlPlaneURL string        // https://[project].supabase.co/functions/v1

	// Optional — defaults to sensible production values
	MetricsInterval      time.Duration // How often to collect metrics (default: 15s)
	MetricsBatchInterval time.Duration // How often to send batched metrics (default: 60s)
	HeartbeatInterval    time.Duration // Heartbeat frequency (default: 30s)
	LogBatchSize         int           // Max log lines per batch (default: 100)
	MaxBufferAge         time.Duration // Max time to buffer if API unreachable (default: 10min)

	// Agent metadata
	AgentVersion string
}

// Load reads configuration from environment variables and panics on missing required vars.
func Load() *Config {
	return &Config{
		AgentToken:           mustEnv("AUTOSTACK_AGENT_TOKEN"),
		ClusterID:            mustEnv("AUTOSTACK_CLUSTER_ID"),
		ControlPlaneURL:      mustEnv("AUTOSTACK_CONTROL_PLANE_URL"),
		MetricsInterval:      duration("AUTOSTACK_METRICS_INTERVAL", 15*time.Second),
		MetricsBatchInterval: duration("AUTOSTACK_BATCH_INTERVAL", 60*time.Second),
		HeartbeatInterval:    duration("AUTOSTACK_HEARTBEAT_INTERVAL", 30*time.Second),
		LogBatchSize:         integer("AUTOSTACK_LOG_BATCH_SIZE", 100),
		MaxBufferAge:         duration("AUTOSTACK_MAX_BUFFER_AGE", 10*time.Minute),
		AgentVersion:         "1.1.0",
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("Required environment variable not set: %s", key)
	}
	return v
}

func duration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		log.Printf("Invalid duration for %s=%q, using default %v", key, v, fallback)
		return fallback
	}
	return d
}

func integer(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Printf("Invalid integer for %s=%q, using default %d", key, v, fallback)
		return fallback
	}
	return n
}
