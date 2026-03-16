# 🚀 Deploy the Fixed Function NOW

You've set the AWS secrets ✅  
Now we need to deploy the FIXED function code.

---

## 🎯 The Situation

- ✅ AWS secrets are set in Supabase
- ❌ OLD function version is deployed (requires auth)
- ✅ NEW function code is ready (auth optional)
- 🎯 Need to deploy NEW version

---

## ⚡ FASTEST METHOD (2 minutes)

### Get a Personal Access Token

1. **Go to:** https://supabase.com/dashboard/account/tokens

2. **Click:** "Generate new token"

3. **Name it:** "AutoStack Deploy"

4. **Copy the token** (starts with `sbp_`)

5. **Run these commands:**

```bash
# Login with your new token
supabase login --token sbp_YOUR_TOKEN_HERE

# Deploy the fixed function
supabase functions deploy aws-assume-role --project-ref prrmrukwmrjkdxcyzovd --no-verify-jwt
```

6. **Test it:**

```bash
curl -X POST "https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/aws-assume-role" \
  -H "Content-Type: application/json" \
  -d '{"role_arn":"arn:aws:iam::367749063363:role/AutoStackDeploymentRole","account_id":"367749063363","external_id":"test"}'
```

**Should return:** `{"verified": true, ...}` ✅

---

## 🎯 ALTERNATIVE: Deploy via Dashboard

If you can't use CLI, deploy via Dashboard:

1. **Go to:** https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/functions

2. **Find:** `aws-assume-role` function

3. **Click:** "Deploy" or "Redeploy"

4. **Wait** for deployment to complete

---

## ✅ After Deployment

Test from your UI:
1. Open AutoStack frontend
2. Click "Verify & Continue"
3. Should work! ✅

---

**Get that token and deploy! You're 1 command away from success! 🚀**
