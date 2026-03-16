# AWS Secrets Required in Supabase

## Current Issue

The test is failing with a 502 Bad Gateway error when calling `setup-build-pipeline`. This means the Edge Function is crashing, most likely because AWS credentials are missing.

## What's Happening

The `setup-build-pipeline` function needs to:
1. Query `cloud_credentials` table for the org's IAM role ARN ✅ (this works now)
2. Use AutoStack's own AWS credentials to assume that role ❌ (this is failing)

The function tries to access:
```typescript
const stsClient = new STSClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
  }
})
```

If these environment variables don't exist, the function crashes with 502.

## Required Secrets

You need to add these secrets to Supabase Edge Functions:

1. **AWS_ACCESS_KEY_ID** - AutoStack's service account access key
2. **AWS_SECRET_ACCESS_KEY** - AutoStack's service account secret key

These are NOT the user's credentials. These are AutoStack's own AWS credentials that have permission to assume the user's IAM role.

## How to Add Secrets

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/settings/functions

2. Scroll to "Secrets" section

3. Add two secrets:
   - Name: `AWS_ACCESS_KEY_ID`
     Value: [Your AutoStack AWS access key]
   
   - Name: `AWS_SECRET_ACCESS_KEY`
     Value: [Your AutoStack AWS secret key]

4. Click "Save"

### Option 2: Via Supabase CLI

```bash
# Set AWS_ACCESS_KEY_ID
supabase secrets set AWS_ACCESS_KEY_ID=AKIA...

# Set AWS_SECRET_ACCESS_KEY  
supabase secrets set AWS_SECRET_ACCESS_KEY=...
```

## What AWS Credentials to Use

You need an IAM user in your AWS account (367749063363) with these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::*:role/AutoStackDeploymentRole"
    }
  ]
}
```

This allows AutoStack to assume the user's deployment role.

## Creating the IAM User (If Needed)

1. Go to AWS IAM Console: https://console.aws.amazon.com/iam/

2. Create a new IAM user named `autostack-service`

3. Attach this inline policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "sts:AssumeRole",
         "Resource": "arn:aws:iam::*:role/AutoStackDeploymentRole"
       }
     ]
   }
   ```

4. Create access keys for this user

5. Add the access key ID and secret to Supabase secrets

## Verification

After adding the secrets, run the test again:

```bash
./test-build-pipeline-only.sh
```

Expected output:
```
▶ Step 3: Setting up build pipeline (ECR + CodeBuild)...
✓ Build pipeline created
  ECR: 367749063363.dkr.ecr.us-east-1.amazonaws.com/autostack-test-app
  CodeBuild: autostack-build-project-xxxxx
```

## Alternative: Use Existing Credentials

If you already have AWS credentials set up somewhere (like in `rootkey.csv`), you can use those. Just add them as Supabase secrets.

## Why This Is Needed

The architecture works like this:

```
User's AWS Account
  └─ IAM Role: AutoStackDeploymentRole
       └─ Trust relationship allows AutoStack to assume it

AutoStack's AWS Account  
  └─ IAM User: autostack-service
       └─ Can assume user's role
       └─ Credentials stored in Supabase secrets
```

When deploying:
1. User connects their AWS account (provides role ARN)
2. AutoStack stores role ARN in `cloud_credentials` table
3. When deploying, AutoStack uses its own credentials to assume user's role
4. Then creates resources in user's account

## Current Status

✅ Migrations applied
✅ cloud_credentials table exists
✅ Test credentials inserted
✅ Function can query credentials
❌ Function crashes when trying to assume role (missing AWS secrets)

## Next Step

Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to Supabase Edge Function secrets, then run the test again.
