# STATE.md — AutoStack Session Memory

**Last Updated: 2026-03-16**
**Current Phase: Immediate Fixes + Phase 3 AI Intelligence**

---

## WHERE WE ARE RIGHT NOW

The frontend shell is 95% complete and looks production-grade.
The backend infrastructure (23 Edge Functions, 16 tables, RLS) is deployed.
The diagnostic report claimed 100% passing — it lied. Tests ran simulations.

**The three P0 blockers right now:**
1. `auth-hook` may not be registered as Supabase Auth Hook → users have no org_id in JWT → all RLS returns 0 rows → empty dashboard
2. `pr_url` is null after `die-analyze` → DIE engine never actually opens a PR
3. `infra-provision` tested with mocked AWS calls → no real infrastructure exists

**Before starting ANY new feature:** verify these 3 are real.

---

## CRITICAL DECISIONS (Architecture Decisions Records)

### ADR-001: Auth Strategy — Supabase Auth (NOT Clerk)
- Reason: Native RLS integration. org_id in JWT automatically scopes all DB queries.
- Consequence: auth-hook MUST set user_metadata.org_id or everything breaks.

### ADR-002: "Your Cloud" Model (NOT platform cloud)
- Reason: Enterprise customers can't use Railway/Render. AutoStack's kill shot.
- Consequence: IAM role assumption required before any deployment.

### ADR-003: Vector DB — pgvector in Supabase (NOT Pinecone)
- Reason: Already in Supabase, zero extra cost, same capability.
- Consequence: incident_patterns must have embedding column + ivfflat index.

### ADR-004: One PR per COIE finding (NOT batched PRs)
- Reason: Each fix is independently reviewable and revertable.
- Consequence: Many small PRs. Not one big one.

### ADR-005: AIRE must always produce output
- Reason: A perpetually "detected" incident is worse than "unknown pattern".
- Consequence: Even when no pattern matches, status must update to "diagnosed".

### ADR-006: Go agent binary uses FROM scratch Docker image
- Reason: Smallest possible attack surface. No shell, no package manager.
- Consequence: Must include CA certificates in the build.

### ADR-007: Sentry tracesSampleRate = 0.1 in production
- Reason: Free tier = 10K transactions/month. At 1K users × 10 nav = 10K/day without sampling.
- Status: ✅ CONFIRMED already set.

### ADR-008: All AWS resources tagged with autostack:deployment = [id]
- Reason: Teardown scans by tag. Without this, orphaned resources cost money forever.
- Consequence: Tag MUST be added to every resource in infra-provision.

---

## ENVIRONMENT VARIABLES (what's confirmed set)

### Supabase Edge Function Secrets — CHECK EACH:
- [ ] RESEND_API_KEY — re_xxx — if missing: zero emails
- [ ] GITHUB_APP_PRIVATE_KEY — PEM string — if missing: all GitHub API calls fail
- [ ] GITHUB_APP_ID — integer — if missing: GitHub App JWT cannot be generated
- [ ] GITHUB_WEBHOOK_SECRET — random hex — if missing: SECURITY HOLE
- [ ] UPSTASH_REDIS_REST_URL — https://xxx.upstash.io
- [ ] UPSTASH_REDIS_REST_TOKEN — token
- [ ] OPENAI_API_KEY — sk-xxx — if missing: AIRE Tier 2 never runs
- [ ] NOTIFICATION_SECRET — random string — used by internal function-to-function calls

### Frontend .env.local — CHECK EACH:
- [ ] VITE_SUPABASE_URL
- [ ] VITE_SUPABASE_ANON_KEY
- [ ] VITE_POSTHOG_KEY
- [ ] VITE_POSTHOG_HOST
- [ ] VITE_SENTRY_DSN
- [ ] VITE_APP_URL

---

## KNOWN BLOCKERS

### BLOCKER-001: auth-hook not registered
**Symptom:** User signs up, dashboard is empty everywhere.
**Root cause:** auth-hook Edge Function deployed but not registered in Supabase Dashboard → Authentication → Hooks.
**Fix:** Go to Supabase Dashboard → Auth → Hooks → after user creation → set to supabase/functions/auth-hook.
**Verification:** Sign up with new email → check organizations table → must have 1 row → check user raw_user_meta_data → must have org_id key.

### BLOCKER-002: pr_url stays null
**Symptom:** die-analyze appears to complete but pr_url is null in deployments table.
**Root cause:** GitHub PR creation code exists but fails silently OR is not called.
**Fix:** Add explicit error throwing + logging in openManifestPR(). Check GitHub App installation on the test repo.
**Verification:** After die-analyze: `SELECT pr_url FROM deployments ORDER BY created_at DESC LIMIT 1` → must NOT be null.

### BLOCKER-003: GitHub 404s
**Symptom:** die-analyze fails with 404 when fetching repo files.
**Root cause:** GitHub App not installed on the specific repository (org-level install vs repo-level).
**Fix:** When 404 occurs, check if it's "installation not found" error. Show user: "Install the AutoStack GitHub App on this repository."
**Verification:** Install GitHub App on test repo → retry die-analyze → no 404.

### BLOCKER-004: COIE writes nothing to DB
**Symptom:** Score cards always show 0 or null. Never update.
**Root cause:** coie-cycle calculates scores but doesn't write them to environments table.
**Fix:** After scoring, must: UPDATE environments (3 score columns + health_score), INSERT cluster_scores, INSERT findings.
**Verification:** Trigger coie-cycle manually → query environments table → scores must have changed → query cluster_scores → new row must exist.

---

## SESSION LOG

### 2026-03-16 (Current)
- Merged 20+ files from previous Claude conversations into merged.md
- Completed comprehensive audit: diagnostic report was fabricated (simulations ≠ real tests)
- Identified 3 P0 blockers
- Created THE_REAL_FINAL_PROMPT.md with full UX spec + implementation contracts
- Created GSD framework files (this session)
- **Next action:** Antigravity runs /execute with the immediate fixes, then Phase 3

---

## WHAT TO DO NEXT (In This Exact Order)

1. Run `/execute fixes` — address all immediate fix tasks
2. Manually verify BLOCKER-001: sign up test user, check organizations table
3. Manually verify BLOCKER-003: connect test GitHub repo, verify no 404
4. Run Phase 3 tasks: COIE real scoring, AIRE pattern matching, notifications
5. Run end-to-end test: new user → deploy test repo → get live URL
6. Fix whatever fails in E2E test
7. Then and only then: Phase 4 (GitHub App full integration)

---

## FILES THAT MUST NOT BE MODIFIED WITHOUT CAREFUL REVIEW

- `src/hooks/useData.js` — core data layer, realtime subscriptions
- `supabase/migrations/001_initial_schema.sql` — ALL migrations must be idempotent
- `supabase/functions/auth-hook/index.ts` — touches auth, breaks everything if wrong
- `supabase/functions/_shared/cors.ts` — used by all functions
- `src/lib/supabase.js` — realtime config, must keep eventsPerSecond: 10

---

## QUICK VERIFICATION COMMANDS

```bash
# Check auth-hook fired correctly for a user
SELECT id, email, raw_user_meta_data->>'org_id' as org_id FROM auth.users ORDER BY created_at DESC LIMIT 5;
# Expected: org_id is NOT null for all recent users

# Check COIE is running
SELECT jobname, last_run, next_run FROM cron.job;
# Expected: coie-evaluation, weekly-digest, cleanup-old-data all listed

# Check incident_patterns seeded
SELECT COUNT(*) FROM incident_patterns;
# Expected: 10

# Check latest COIE wrote findings
SELECT COUNT(*), MAX(created_at) FROM findings;
# Expected: count > 0, created_at within last 5 minutes after manual trigger

# Check AIRE diagnosed last incident
SELECT matched_pattern, pattern_confidence, status FROM incidents ORDER BY detected_at DESC LIMIT 1;
# Expected: matched_pattern NOT null, status = 'diagnosed'

# Check PR was opened
SELECT pr_url, analysis_status FROM deployments ORDER BY created_at DESC LIMIT 1;
# Expected: pr_url NOT null, analysis_status = 'complete'
```
