# 🔑 Get Valid AWS Credentials

The function is deployed ✅ but the AWS credentials are invalid.

---

## 🚨 The Error

```
"Invalid AWS credentials or account ID."
"InvalidClientTokenId": "The security token included in the request is invalid."
```

This means the AWS Access Key ID you provided is not valid or has been deactivated.

---

## ✅ How to Get Valid AWS Credentials

### Step 1: Login to AWS Console

Go to: https://console.aws.amazon.com/

### Step 2: Create New Access Keys

1. **Go to IAM:** https://console.aws.amazon.com/iam/
2. **Click:** "Users" in left sidebar
3. **Click:** Your username
4. **Click:** "Security credentials" tab
5. **Scroll to:** "Access keys" section
6. **Click:** "Create access key"
7. **Select:** "Command Line Interface (CLI)"
8. **Check:** "I understand..." checkbox
9. **Click:** "Create access key"
10. **Copy both:**
    - Access key ID (starts with `AKIA...`)
    - Secret access key (long random string)

### Step 3: Update Supabase Secrets

```bash
supabase secrets set \
  AWS_ACCESS_KEY_ID="YOUR_NEW_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="YOUR_NEW_SECRET_ACCESS_KEY" \
  --project-ref prrmrukwmrjkdxcyzovd
```

### Step 4: Test Again

```bash
curl -X POST "https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/aws-assume-role" \
  -H "Content-Type: application/json" \
  -d '{"role_arn":"arn:aws:iam::367749063363:role/AutoStackDeploymentRole","account_id":"367749063363","external_id":"test"}'
```

Should return: `{"verified": true, ...}` ✅

---

## 🔍 Alternative: Check Existing Credentials

If you have existing AWS credentials, check if they're valid:

```bash
# Test with AWS CLI
aws sts get-caller-identity

# Should return your account info
# If error: credentials are invalid
```

---

## 📝 Important Notes

1. **Access keys must be from the same AWS account** (367749063363)
2. **Keys must have permissions** to call `sts:AssumeRole`
3. **Keys must be active** (not deleted or deactivated)

---

## 🎯 After Getting Valid Credentials

1. Update secrets in Supabase (command above)
2. Test the function (curl command above)
3. Test from UI - click "Verify & Continue"
4. Should work! ✅

---

**Get valid AWS credentials and update the secrets! 🔑**
