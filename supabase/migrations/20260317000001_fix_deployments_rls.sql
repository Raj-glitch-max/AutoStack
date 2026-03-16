-- Fix RLS policies for deployments table
-- Allow users to create and manage deployments

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view deployments" ON deployments;
DROP POLICY IF EXISTS "Users can create deployments" ON deployments;
DROP POLICY IF EXISTS "Users can update deployments" ON deployments;

-- Enable RLS
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role has full access to deployments" ON deployments;
CREATE POLICY "Service role has full access to deployments"
ON deployments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can view deployments in their org
CREATE POLICY "Users can view deployments in their org"
ON deployments
FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);

-- Authenticated users can create deployments
CREATE POLICY "Users can create deployments in their org"
ON deployments
FOR INSERT
TO authenticated
WITH CHECK (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);

-- Authenticated users can update deployments
CREATE POLICY "Users can update deployments in their org"
ON deployments
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

-- For development/testing: Allow anon access (REMOVE IN PRODUCTION!)
DROP POLICY IF EXISTS "Allow anon access for testing" ON deployments;
CREATE POLICY "Allow anon access for testing"
ON deployments
FOR ALL
TO anon
USING (true)
WITH CHECK (true);
