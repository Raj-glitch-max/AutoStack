// Package client provides an HTTP client for communicating with the AutoStack control plane.
// Handles agent registration (one-time token → JWT) and automatic JWT rotation.
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

// Client is the control plane HTTP client with JWT lifecycle management.
type Client struct {
	baseURL    string
	httpClient *http.Client
	clusterID  string
	version    string

	mu             sync.RWMutex
	jwt            string
	tokenExpiresAt time.Time
}

// New creates a Client configured for the given control plane URL.
func New(baseURL, clusterID, version string) *Client {
	return &Client{
		baseURL:   baseURL,
		clusterID: clusterID,
		version:   version,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// SetJWT atomically updates the JWT used for authenticated requests.
func (c *Client) SetJWT(jwt string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.jwt = jwt
}

// GetJWT returns the current JWT.
func (c *Client) GetJWT() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.jwt
}

// Register exchanges the one-time agent token for a JWT.
// The token is invalidated server-side after first use.
func (c *Client) Register(ctx context.Context, agentToken string) (string, error) {
	body := map[string]string{
		"agent_token": agentToken,
		"cluster_id":  c.clusterID,
		"version":     c.version,
	}

	resp, err := c.post(ctx, "/agent-register", body, agentToken)
	if err != nil {
		return "", fmt.Errorf("registration failed: %w", err)
	}

	var result struct {
		JWT       string `json:"jwt"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return "", fmt.Errorf("registration response decode failed: %w", err)
	}

	c.mu.Lock()
	c.jwt = result.JWT
	c.tokenExpiresAt, _ = time.Parse(time.RFC3339, result.ExpiresAt)
	c.mu.Unlock()

	return result.JWT, nil
}

// RotateJWTLoop continuously rotates the JWT 30 minutes before expiry.
// Blocks until ctx is cancelled.
func (c *Client) RotateJWTLoop(ctx context.Context) {
	for {
		c.mu.RLock()
		expiresAt := c.tokenExpiresAt
		c.mu.RUnlock()

		timeUntilRefresh := time.Until(expiresAt) - 30*time.Minute
		if timeUntilRefresh < 0 {
			timeUntilRefresh = 0
		}

		select {
		case <-time.After(timeUntilRefresh):
			newJWT, err := c.refreshJWT(ctx)
			if err != nil {
				log.Printf("[Client] JWT rotation failed: %v — retrying in 5 min", err)
				time.Sleep(5 * time.Minute)
				continue
			}
			c.SetJWT(newJWT)
			log.Println("[Client] JWT rotated successfully")
		case <-ctx.Done():
			return
		}
	}
}

// Send posts an authenticated request to the given endpoint path.
func (c *Client) Send(ctx context.Context, path string, payload interface{}) error {
	_, err := c.post(ctx, path, payload, c.GetJWT())
	return err
}

func (c *Client) refreshJWT(ctx context.Context) (string, error) {
	body := map[string]string{
		"cluster_id": c.clusterID,
	}

	resp, err := c.post(ctx, "/agent-refresh-token", body, c.GetJWT())
	if err != nil {
		return "", fmt.Errorf("refresh request failed: %w", err)
	}

	var result struct {
		JWT       string `json:"jwt"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return "", fmt.Errorf("refresh decode failed: %w", err)
	}

	c.mu.Lock()
	c.tokenExpiresAt, _ = time.Parse(time.RFC3339, result.ExpiresAt)
	c.mu.Unlock()

	return result.JWT, nil
}

func (c *Client) post(ctx context.Context, path string, payload interface{}, token string) ([]byte, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal failed: %w", err)
	}

	url := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("request creation failed: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "AutoStack-Agent/"+c.version)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("body read failed: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}
