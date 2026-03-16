-- Migration: Fix RLS policies for integrations and projects tables
-- Allows authenticated users to access their org's data

-- Fix integrations table RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrations_org_access" ON public.integrations;
CREATE POLICY "integrations_org_access" ON public.integrations
  FOR ALL USING (
    org_id = auth.org_id() OR
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Fix projects table RLS  
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_org_access" ON public.projects;
CREATE POLICY "projects_org_access" ON public.projects
  FOR ALL USING (
    org_id = auth.org_id() OR
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Allow anon users to insert projects (for onboarding before signup)
DROP POLICY IF EXISTS "projects_anon_insert" ON public.projects;
CREATE POLICY "projects_anon_insert" ON public.projects
  FOR INSERT WITH CHECK (true);

-- Allow anon users to read integrations (for onboarding)
DROP POLICY IF EXISTS "integrations_anon_read" ON public.integrations;
CREATE POLICY "integrations_anon_read" ON public.integrations
  FOR SELECT USING (true);
