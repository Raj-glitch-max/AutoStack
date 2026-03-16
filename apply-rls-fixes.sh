#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          Applying RLS Policy Fixes to Supabase                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "▶ Applying migration: 20260317000000_fix_projects_rls.sql"
supabase db push --db-url "postgresql://postgres:UOVWHGx0qnF0bWz3@db.prrmrukwmrjkdxcyzovd.supabase.co:5432/postgres" \
  --file supabase/migrations/20260317000000_fix_projects_rls.sql

echo ""
echo "▶ Applying migration: 20260317000001_fix_deployments_rls.sql"
supabase db push --db-url "postgresql://postgres:UOVWHGx0qnF0bWz3@db.prrmrukwmrjkdxcyzovd.supabase.co:5432/postgres" \
  --file supabase/migrations/20260317000001_fix_deployments_rls.sql

echo ""
echo "✓ RLS policies updated!"
echo ""
echo "You can now:"
echo "  1. Refresh the frontend (http://localhost:3000)"
echo "  2. Try deploying again"
echo ""
