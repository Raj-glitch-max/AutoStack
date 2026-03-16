-- Fix RLS policies for projects table
-- Allow users to create and manage their own projects

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own projects" ON projects;
DROP POLICY IF EXISTS "Users can create projects" ON projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON projects;

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything (for backend functions)
DROP POLICY IF EXISTS "Service role has full access to projects" ON projects;
CREATE POLICY "Service role has full access to projects"
ON projects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated users to view projects in their org
CREATE POLICY "Users can view projects in their org"
ON projects
FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to create projects in their org
CREATE POLICY "Users can create projects in their org"
ON projects
FOR INSERT
TO authenticated
WITH CHECK (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to update projects in their org
CREATE POLICY "Users can update projects in their org"
ON projects
FOR UPDATE
TO authenticated
USING (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to delete projects in their org
CREATE POLICY "Users can delete projects in their org"
ON projects
FOR DELETE
TO authenticated
USING (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);

-- For development/testing: Allow anon access (REMOVE IN PRODUCTION!)
DROP POLICY IF EXISTS "Allow anon access for testing" ON projects;
CREATE POLICY "Allow anon access for testing"
ON projects
FOR ALL
TO anon
USING (true)
WITH CHECK (true);
