# Fix RLS Policies and UI Issues

## Problem
1. **RLS Error**: "new row violates row-level security policy for table 'projects'"
2. **Old UI**: Onboarding page shows old mockup deployment flow

## Solution

### Step 1: Apply RLS Fixes via Supabase Dashboard

Go to: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/sql/new

**Run Migration 1** - Fix Projects RLS:
```sql
-- Copy contents from: supabase/migrations/20260317000000_fix_projects_rls.sql
-- Paste into SQL Editor and click "Run"
```

**Run Migration 2** - Fix Deployments RLS:
```sql
-- Copy contents from: supabase/migrations/20260317000001_fix_deployments_rls.sql
-- Paste into SQL Editor and click "Run"
```

### Step 2: Rebuild Frontend

```bash
# Stop current Docker container
docker-compose down

# Rebuild with latest code
docker-compose up -d --build

# Or if using dev server:
cd frontend
npm run build
```

### Step 3: Clear Browser Cache

1. Open http://localhost:3000
2. Press Ctrl+Shift+R (or Cmd+Shift+R on Mac) to hard refresh
3. Or clear browser cache completely

## What Was Fixed

### RLS Policies
- Added policies for `anon` role (for testing)
- Added policies for `service_role` (for backend functions)
- Added policies for `authenticated` users
- Projects and deployments now allow inserts

### Files Created
1. `supabase/migrations/20260317000000_fix_projects_rls.sql`
2. `supabase/migrations/20260317000001_fix_deployments_rls.sql`

## Verify It Works

After applying fixes, try deploying again. You should see:
- No RLS errors
- Real deployment progress
- Live logs from backend

## If Still Having Issues

Check browser console (F12) for errors and share them.
