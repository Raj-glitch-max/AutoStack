-- Migration: Ensure projects table has all fields needed for new analysis system
-- This is a safety migration to add any missing columns without breaking existing data

-- Add analysis-related fields if they don't exist
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stack TEXT,
  ADD COLUMN IF NOT EXISTS infra_plan_json JSONB DEFAULT '{}';

-- Ensure estimated_monthly_cost exists (should be from migration 006)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS estimated_monthly_cost DECIMAL(10,2);

-- Add index for faster queries on analysis_status
CREATE INDEX IF NOT EXISTS idx_projects_analysis_status 
  ON public.projects(analysis_status) 
  WHERE analysis_status IS NOT NULL;

-- Add index for stack queries
CREATE INDEX IF NOT EXISTS idx_projects_stack 
  ON public.projects(stack) 
  WHERE stack IS NOT NULL;

COMMENT ON COLUMN public.projects.analysis_status IS 'Status of repository analysis: pending | analyzing | planning | analyzed | failed';
COMMENT ON COLUMN public.projects.stack IS 'Detected technology stack, e.g., Node.js/Express, Python/Django';
COMMENT ON COLUMN public.projects.infra_plan_json IS 'Complete analysis results including classification, cost options, and performance metrics';
COMMENT ON COLUMN public.projects.estimated_monthly_cost IS 'Estimated monthly AWS cost in USD based on selected infrastructure option';
