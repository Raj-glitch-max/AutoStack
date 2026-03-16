# Register Auth Hook

The auth hook must be registered manually via Supabase Dashboard.

## Steps

1. Go to: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/auth/hooks

2. Click "Add Hook" or "Create Hook"

3. Configure:
   - **Hook Type:** "After signup" or "user.created"
   - **Function:** Select `auth-hook` from dropdown
   - **Enabled:** Yes/On

4. Click "Save" or "Create"

## What This Does

When a user signs up, the auth-hook function will:
- Create an organization for the user
- Set `org_id` in user metadata
- This is required for RLS policies to work

## Verification

After registering, create a test user and check if `org_id` is set in their metadata.
