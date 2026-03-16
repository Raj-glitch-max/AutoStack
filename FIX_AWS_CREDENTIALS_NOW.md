# ⚠️ AWS Credentials Issue - Action Required

## The Problem

The AWS credentials stored in Supabase Edge Function secrets are NOT actual AWS credentials. They appear to be hashed/encrypted values:

```
AWS_ACCESS_KEY_ID: 4767ac25a9836987f24198379a55b1a342599aeea69cbc9321fcd3ff7f03c867
AWS_SECRET_ACCESS_KEY: 61e65443792039b8062b73965d7160e3ea8412b749339fa4d8c68bd2a39b291e
```

These are SHA256 hashes, not real AWS credentials.

## What Real AWS Credentials Look Like

- **Access Key ID**: Starts with `AKIA` (20 characters total)
  - Example: `AKIAIOSFODNN7EXAMPLE`
  
- **Secret Access Key**: 40-character base64 string
  - Example: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

## Where to Get Real AWS Credentials

### Option 1: Use Existing Credentials from rootkey.csv

If you have `rootkey.csv` in the project root, it should contain real AWS credentials:

```bash
# Check if rootkey.csv exists and show first few characters
if [ -f rootkey.csv ]; then
  head -2 rootkey.csv
fi
```

### Option 2: Create New IAM User

1. Go to AWS IAM Console: https://console.aws.amazon.com/iam/

2. Click "Users" → "Create user"

3. User name: `autostack-service`

4. Click "Next"

5. Attach policies directly → Create inline policy:
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

6. Click "Next" → "Create user"

7. Click on the user → "Security credentials" tab

8. Click "Create access key"

9. Select "Application running outside AWS"

10. Click "Create access key"

11. **IMPORTANT**: Copy both values immediately:
    - Access key ID (starts with AKIA)
    - Secret access key (40 characters)

## How to Set the Correct Credentials

### Via Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/settings/functions

2. Scroll to "Secrets" section

3. Find `AWS_ACCESS_KEY_ID` and click "Edit"
   - Replace with your REAL access key (starts with AKIA)
   - Click "Save"

4. Find `AWS_SECRET_ACCESS_KEY` and click "Edit"
   - Replace with your REAL secret key (40 characters)
   - Click "Save"

5. The functions will automatically restart with new credentials

### Via Supabase CLI

```bash
# Set real AWS credentials
supabase secrets set AWS_ACCESS_KEY_ID=AKIA...  # Your real access key
supabase secrets set AWS_SECRET_ACCESS_KEY=...   # Your real secret key (40 chars)
```

## Verify the Fix

After setting real credentials, test them:

```bash
curl -s -X POST "https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/test-aws-creds" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k" | jq '.'
```

Expected output:
```json
{
  "success": true,
  "message": "AWS credentials are valid and can assume the deployment role",
  "tests": {
    "callerIdentity": {
      "success": true,
      "account": "367749063363",
      "arn": "arn:aws:iam::367749063363:user/autostack-service"
    },
    "assumeRole": {
      "success": true,
      "roleArn": "arn:aws:iam::367749063363:role/AutoStackDeploymentRole"
    }
  }
}
```

## Then Run the Pipeline Test

Once credentials are verified:

```bash
./test-build-pipeline-only.sh
```

Expected: ECR and CodeBuild resources created successfully.

## Why This Happened

The values you saw in the Supabase dashboard are hashed representations for security. The actual credentials need to be set using the dashboard or CLI, not by looking at the hashed values.

## Current Status

✅ Migrations applied
✅ Database schema ready
✅ Functions deployed
✅ Test scripts ready
❌ AWS credentials are not real AWS credentials (hashed values instead)

## Next Step

Set real AWS credentials in Supabase secrets, then run the test.
