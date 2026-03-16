# Current Issue Summary

## What's Working ✅
1. Database migrations applied successfully
2. cloud_credentials table exists and has data
3. AWS credentials ARE set correctly in Supabase:
   - AWS_ACCESS_KEY_ID: Exists, 61 chars, starts with AKIA ✅
   - AWS_SECRET_ACCESS_KEY: Exists, 40 chars ✅
   - AWS_REGION: us-east-1 ✅
4. Simple Edge Functions work (test-env returns 200)
5. Functions can access environment variables

## What's Failing ❌
- `setup-build-pipeline` function returns 502 Bad Gateway
- `test-aws-creds` function also returns 502 Bad Gateway
- Both functions crash when trying to use AWS SDK

## Most Likely Cause

The function is crashing when trying to **assume the IAM role**. The AWS credentials are valid, but the AssumeRole operation is failing.

This happens in `aws-client.ts` at this line:
```typescript
const assumed = await stsClient.send(new AssumeRoleCommand({
  RoleArn: creds.role_arn,  // arn:aws:iam::367749063363:role/AutoStackDeploymentRole
  RoleSessionName: `autostack-${Date.now()}`,
  ExternalId: creds.external_id || 'autostack',
  DurationSeconds: 3600,
}))
```

## Possible Reasons for AssumeRole Failure

### 1. IAM Role Doesn't Exist
The role `arn:aws:iam::367749063363:role/AutoStackDeploymentRole` might not exist in your AWS account.

**Check:**
```bash
aws iam get-role --role-name AutoStackDeploymentRole
```

### 2. Trust Policy Not Configured
The role exists but doesn't trust the IAM user whose credentials are in Supabase.

**Check:**
```bash
aws iam get-role --role-name AutoStackDeploymentRole --query 'Role.AssumeRolePolicyDocument'
```

Expected trust policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::367749063363:user/YOUR_IAM_USER"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "autostack"
        }
      }
    }
  ]
}
```

### 3. IAM User Lacks sts:AssumeRole Permission
The IAM user whose credentials are in Supabase doesn't have permission to assume roles.

**Check:**
```bash
# Get the current user
aws sts get-caller-identity

# Check user's policies
aws iam list-attached-user-policies --user-name YOUR_USER_NAME
aws iam list-user-policies --user-name YOUR_USER_NAME
```

Expected policy on the IAM user:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::367749063363:role/AutoStackDeploymentRole"
    }
  ]
}
```

### 4. External ID Mismatch
The role requires a different external ID than "autostack".

## How to Fix

### Option 1: Create the IAM Role (If It Doesn't Exist)

```bash
# Create trust policy file
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::367749063363:user/autostack-service"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "autostack"
        }
      }
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name AutoStackDeploymentRole \
  --assume-role-policy-document file://trust-policy.json

# Attach permissions (for ECR, CodeBuild, App Runner, etc.)
aws iam attach-role-policy \
  --role-name AutoStackDeploymentRole \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

### Option 2: Update Trust Policy (If Role Exists)

```bash
# Get current IAM user ARN
aws sts get-caller-identity

# Update trust policy to allow that user
aws iam update-assume-role-policy \
  --role-name AutoStackDeploymentRole \
  --policy-document file://trust-policy.json
```

### Option 3: Use Root Credentials (Quick Test)

If you have root account credentials in `rootkey.csv`, those should be able to assume any role. But this is NOT recommended for production.

## Next Steps

1. **Check if role exists:**
   ```bash
   aws iam get-role --role-name AutoStackDeploymentRole
   ```

2. **If role doesn't exist:** Create it using Option 1 above

3. **If role exists:** Check and update trust policy using Option 2 above

4. **Test again:**
   ```bash
   ./test-build-pipeline-only.sh
   ```

## Expected Result After Fix

```
▶ Step 3: Setting up build pipeline (ECR + CodeBuild)...
✓ Build pipeline created
  ECR: 367749063363.dkr.ecr.us-east-1.amazonaws.com/autostack/test-app
  CodeBuild: autostack-build-test-app-xxxxx
```

## Current Status

- ✅ All code complete and deployed
- ✅ Database schema ready
- ✅ AWS credentials configured correctly
- ❌ IAM role configuration needs to be verified/fixed
- ⏳ Waiting for IAM role setup to test pipeline

The code is ready. We just need the AWS IAM role to be configured correctly so the credentials can assume it.
