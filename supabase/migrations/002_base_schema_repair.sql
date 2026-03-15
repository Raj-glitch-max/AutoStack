-- Migration 002: Base Schema Repair
-- Fixes missing columns in projects and creates missing core tables

-- 1. Ensure projects has all required columns
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS die_stage TEXT;

-- 2. Create infrastructure_events (Required for Phase B3 and Edge Functions)
CREATE TABLE IF NOT EXISTS public.infrastructure_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage       TEXT        NOT NULL,
  status      TEXT        NOT NULL,
  message     TEXT,
  details     JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for live deploy progress
CREATE INDEX IF NOT EXISTS idx_infra_events_project_time 
  ON public.infrastructure_events(project_id, created_at ASC);

ALTER TABLE public.infrastructure_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "infra_events_org_access" ON public.infrastructure_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = infrastructure_events.project_id
      AND p.org_id = auth.org_id()
    )
  );
