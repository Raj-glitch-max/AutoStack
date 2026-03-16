# 🌿 Branch Strategy

## Branches

### `main` 
- **Status:** Production-ready code (93% complete)
- **Last Update:** 2026-03-16
- **Contains:** Working AWS integration, realistic pricing, auth hooks

### `staging`
- **Status:** Stable working version
- **Purpose:** Testing before production
- **Same as:** main (currently)

### `dev`
- **Status:** Active development
- **Purpose:** All new features and fixes
- **Current Work:** Waiting for implementation plan from Claude

---

## Current Status

✅ **Working:**
- AWS credential verification
- Auth hook registered
- Realistic pricing ($211/$334/$559)
- Edge Functions deployed
- Frontend with updated pricing

⚠️ **Pending:**
- RLS migration (SQL to run)
- Function redeployment
- Frontend rebuild

---

## Next Steps

1. Wait for implementation plan
2. All new work goes in `dev` branch
3. Test in `dev`, merge to `staging`
4. Deploy `staging` to test environment
5. Merge `staging` to `main` for production

---

**Current Branch:** `dev`  
**Ready for:** New implementation plan
