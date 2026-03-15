-- 003_performance_indexes.sql
--
-- Every table that appears in a WHERE clause gets an index.
-- Every time-series table gets a composite (id, time DESC) index.
-- Run EXPLAIN ANALYZE after migration to verify Index Scan (never Seq Scan on >1000 rows).

-- projects (most queried table)
CREATE INDEX IF NOT EXISTS idx_projects_cluster_status
  ON projects(cluster_id, provisioning_status);
CREATE INDEX IF NOT EXISTS idx_projects_org
  ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_repo_branch
  ON projects(repo_url, branch);

-- deployments (time-series)
CREATE INDEX IF NOT EXISTS idx_deployments_project_time
  ON deployments(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_cluster_time
  ON deployments(cluster_id, started_at DESC);

-- cluster_metrics (high volume, time-series)
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_time
  ON cluster_metrics(cluster_id, sampled_at DESC);

-- cluster_scores (MonitoringTab charts)
CREATE INDEX IF NOT EXISTS idx_cluster_scores_time
  ON cluster_scores(cluster_id, evaluated_at DESC);

-- findings (filtered by dimension and status)
CREATE INDEX IF NOT EXISTS idx_findings_cluster_dimension_status
  ON findings(cluster_id, dimension, status);
CREATE INDEX IF NOT EXISTS idx_findings_cluster_severity
  ON findings(cluster_id, severity) WHERE status = 'open';

-- incidents (filtered by status)
CREATE INDEX IF NOT EXISTS idx_incidents_cluster_status_time
  ON incidents(cluster_id, status, detected_at DESC);

-- infrastructure_events (live deploy progress)
CREATE INDEX IF NOT EXISTS idx_infra_events_project_time
  ON infrastructure_events(project_id, created_at ASC);

-- pod_logs (time-series, high volume)
CREATE INDEX IF NOT EXISTS idx_pod_logs_project_time
  ON pod_logs(project_id, logged_at DESC);

-- pipelines
CREATE INDEX IF NOT EXISTS idx_pipelines_cluster_time
  ON pipelines(cluster_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipelines_github_run
  ON pipelines(github_run_id);

-- audit_log (org-scoped, time-ordered)
CREATE INDEX IF NOT EXISTS idx_audit_log_org_time
  ON audit_log(org_id, created_at DESC);

-- cloud_credentials
CREATE INDEX IF NOT EXISTS idx_cloud_credentials_org
  ON cloud_credentials(org_id);

-- project_env_vars
CREATE INDEX IF NOT EXISTS idx_env_vars_project
  ON project_env_vars(project_id);
