package client

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

type Environment struct {
	ID                   string            `json:"id"`
	Name                 string            `json:"name"`
	RepoURL              string            `json:"repo_url"`
	Branch               string            `json:"branch,omitempty"`
	Environment          string            `json:"environment"`
	Size                 string            `json:"size"`
	CloudCredentialID    string            `json:"cloud_credential_id"`
	LiveURL              string            `json:"live_url,omitempty"`
	Status               string            `json:"provisioning_status,omitempty"`
	EstimatedMonthlyCost float64           `json:"estimated_monthly_cost,omitempty"`
	EnvVars              map[string]string `json:"env_vars,omitempty"`
	SecretEnvVars        map[string]string `json:"secret_env_vars,omitempty"`
}

func (c *Client) CreateEnvironment(ctx context.Context, env *Environment) (*Environment, error) {
	body, err := c.doRequest(ctx, "POST", "/environments", env)
	if err != nil {
		return nil, err
	}
	var created Environment
	err = json.Unmarshal(body, &created)
	return &created, err
}

func (c *Client) GetEnvironment(ctx context.Context, id string) (*Environment, error) {
	body, err := c.doRequest(ctx, "GET", fmt.Sprintf("/environments/%s", id), nil)
	if err != nil {
		return nil, err
	}
	var env Environment
	err = json.Unmarshal(body, &env)
	return &env, err
}

func (c *Client) DeleteEnvironment(ctx context.Context, id string) error {
	_, err := c.doRequest(ctx, "DELETE", fmt.Sprintf("/environments/%s", id), nil)
	return err
}

func (c *Client) WaitForStatus(ctx context.Context, id string, targetStatus string, timeout time.Duration) (*Environment, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeoutCtx.Done():
			return nil, fmt.Errorf("timeout waiting for status %s", targetStatus)
		case <-ticker.C:
			env, err := c.GetEnvironment(timeoutCtx, id)
			// Wait for deletion: 404 is success for 'deleted'
			if err != nil && targetStatus == "deleted" && isNotFound(err) {
				return nil, nil
			}
			if err != nil {
				// Retry on transit errors
				continue
			}
			if targetStatus != "deleted" && env.Status == targetStatus {
				return env, nil
			}
			if env.Status == "failed" {
				return nil, fmt.Errorf("environment reached failed state")
			}
		}
	}
}

func isNotFound(err error) bool {
	return err != nil && err.Error() == "API request failed with status 404: {\"error\":\"Not found\"}"
}
