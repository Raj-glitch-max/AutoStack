# ROADMAP.md — AutoStack

**Last Updated: 2026-03-16**
**Current Position: Immediate Fixes → Phase 3 (AI Intelligence)**

---

## Status Legend
- ✅ DONE — verified working
- 🟡 PARTIAL — exists but incomplete/mocked
- 🔴 BROKEN — exists but does not work
- ⬛ NOT STARTED

---

## Milestone 1: Core Product Working (v1.0)

### Immediate Fixes (MUST complete before Phase 3)

| Task | Status | Notes |
|------|--------|-------|
| auth-hook registered as Supabase Auth Hook in dashboard | 🔴 | Verify in Supabase → Auth → Hooks |
| auth-hook sets user_metadata.org_id for GitHub OAuth users | 🔴 | GitHub OAuth users have broken RLS |
| CORS OPTIONS handler on all 23 Edge Functions | 🟡 | Some functions may still be missing |
| HMAC verification on github-webhook | 🔴 | Security hole — anyone can POST fake events |
| incident_patterns table seeded (10 rows) | ✅ | Confirmed |
| Realtime subscription cleanup in useData.js | ✅ | Confirmed |
| Sentry tracesSampleRate = 0.1 | ✅ | Confirmed |
| Form validation inline on blur | 🟡 | Visual only, no real regex enforcement |
| Empty states wired to all tabs | 🟡 | Some tabs show blank |
| AuthGuard loading skeleton | 🔴 | Shows blank/flash before session loads |
| pg_cron jobs registered (coie, cleanup, digest) | 🔴 | Verify in Supabase → Database → cron.job |

---

### Phase 3: AI Intelligence (v0.2.0)

| Task | Status | Notes |
|------|--------|-------|
| 3.1 send-notification Edge Function complete | 🟡 | Partial — missing quota guard, templates |
| 3.2 COIE with real check array + all DB writes | 🔴 | Uses hardcoded data, misses DB writes |
| 3.3 AIRE Tier 1 keyword patterns (10 patterns) | 🟡 | Keyword only, no confidence scoring |
| 3.4 AIRE Tier 2 OpenAI + pgvector semantic search | ⬛ | Not started |
| 3.5 COIE notification wiring | ⬛ | Not started |
| 3.6 AIRE notification wiring | ⬛ | Not started |
| 3.7 Email templates for all 8 notification types | 🟡 | Partial |

---

### Phase 4: DIE Engine (v0.3.0)

| Task | Status | Notes |
|------|--------|-------|
| 4.1 GitHub App installation flow (not OAuth App) | 🟡 | OAuth App exists, needs upgrade to GitHub App |
| 4.2 GitHub webhook HMAC + pipeline sync | 🔴 | HMAC missing |
| 4.3 die-analyze: REAL GitHub API file fetch | 🔴 | May be hardcoded |
| 4.4 die-analyze: Language detection (12 frameworks) | 🟡 | Partial |
| 4.5 die-analyze: Generate all 7 manifest files | 🟡 | Partial |
| 4.6 die-analyze: Open REAL GitHub PR (pr_url NOT null) | 🔴 | pr_url is null |
| 4.7 COIE automated fix PRs for 6 check types | ⬛ | Not started |
| 4.8 infra-provision: REAL AWS SDK calls | 🔴 | Mocked/simulated |
| 4.9 infra-provision: Progress broadcast via Realtime | 🟡 | Partial |
| 4.10 infra-teardown: Tag-based orphan cleanup | 🟡 | Partial |

---

### Phase 5: Go Agent (v0.4.0)

| Task | Status | Notes |
|------|--------|-------|
| 5.1 Go project structure + go.mod | ⬛ | Does not exist |
| 5.2 Agent registration (one-time token exchange) | ⬛ | |
| 5.3 Heartbeat every 30s | ⬛ | |
| 5.4 K8s Watch API for Warning events | ⬛ | |
| 5.5 Metrics collection (metrics-server) | ⬛ | |
| 5.6 Inventory collection → Redis | ⬛ | |
| 5.7 Helm chart with all 7 templates | ⬛ | |
| 5.8 Push agent image to GHCR | ⬛ | |
| 5.9 Publish Helm chart to GitHub Pages | ⬛ | |
| 5.10 Update connect-cluster with real chart URL | ⬛ | |

---

### Phase 6: Production Hardening (v1.0.0)

| Task | Status | Notes |
|------|--------|-------|
| 6.1 Rate limiting on all 23 Edge Functions | 🟡 | Partial |
| 6.2 Input sanitization middleware | 🟡 | Partial |
| 6.3 Audit log wired to all significant actions | 🔴 | Most actions not logged |
| 6.4 Agent token rotation UI | ⬛ | |
| 6.5 Log persistence (Supabase Storage) | ⬛ | Logs tab shows simulation |
| 6.6 Split ui/index.jsx (10K+ lines monolith) | ⬛ | |
| 6.7 Vite chunk optimization | 🟡 | Partial |
| 6.8 Sentry SDK lazy-load (not on landing page) | ⬛ | 450KB loaded everywhere |
| 6.9 Launch checklist: all 40 items verified | ⬛ | |

---

## Milestone 2: Enterprise Features (Post v1.0 — Not in scope now)

- Phase 11: Stripe billing (subscription + usage metering)
- Phase 12: Multi-cloud (GCP + Azure)
- Phase 13: Multi-region deployments
- Phase 14: Managed databases (RDS provisioning)
- Phase 15: On-premises control plane
- Phase 16: AutoStack CLI
- Phase 17: SSO / SAML 2.0
- Phase 18: Terraform provider
- Phase 19: PagerDuty + Datadog + Jira integrations
- Phase 20: SOC2 compliance controls

---

## Current Sprint: Immediate Fixes + Phase 3

**Goal:** After this sprint, a user can sign up → get welcome email → see real COIE scores → get AIRE incident notification → everything real, nothing simulated.

**Sprint tasks (in order):**
1. auth-hook: register in Supabase + fix GitHub OAuth org_id
2. pg_cron: register all 3 jobs
3. CORS: verify all 23 functions have OPTIONS handler
4. send-notification: quota guard + all 8 templates
5. COIE: real check array + all 3 DB writes (environments, cluster_scores, findings)
6. AIRE: real confidence scoring + Tier 2 OpenAI
7. Notification wiring: COIE → send-notification, AIRE → send-notification
8. Form validation: real regex on blur
9. Empty states: wire to all tabs with actionable CTAs
10. AuthGuard: loading skeleton during session check
