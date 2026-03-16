// IAM API calls using direct HTTPS (no SDK)
import { signRequest } from './aws-sig-v4.ts'
import type { AWSCredentials } from './aws-client-direct.ts'

export async function getIAMRole(
  creds: AWSCredentials,
  roleName: string
): Promise<{ roleArn: string } | null> {
  
  const params = new URLSearchParams({
    'Action': 'GetRole',
    'RoleName': roleName,
    'Version': '2010-05-08'
  })

  const payload = params.toString()

  const signed = await signRequest({
    method: 'POST',
    service: 'iam',
    region: 'us-east-1', // IAM is global but uses us-east-1
    endpoint: 'iam.amazonaws.com',
    path: '/',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
    },
    payload,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken
  })

  const response = await fetch(signed.url, {
    method: 'POST',
    headers: signed.headers,
    body: payload
  })

  const text = await response.text()

  if (!response.ok) {
    if (text.includes('NoSuchEntity')) {
      return null
    }
    throw new Error(`IAM GetRole failed: ${text}`)
  }

  const arnMatch = text.match(/<Arn>([^<]+)<\/Arn>/)
  if (!arnMatch) {
    throw new Error('Failed to parse role ARN from response')
  }

  return { roleArn: arnMatch[1] }
}


export async function createIAMRole(
  creds: AWSCredentials,
  roleName: string,
  assumeRolePolicyDocument: string,
  description?: string
): Promise<{ roleArn: string }> {
  
  const params = new URLSearchParams({
    'Action': 'CreateRole',
    'RoleName': roleName,
    'AssumeRolePolicyDocument': assumeRolePolicyDocument,
    'Description': description || `AutoStack managed role: ${roleName}`,
    'Version': '2010-05-08'
  })

  const payload = params.toString()

  const signed = await signRequest({
    method: 'POST',
    service: 'iam',
    region: 'us-east-1',
    endpoint: 'iam.amazonaws.com',
    path: '/',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
    },
    payload,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken
  })

  const response = await fetch(signed.url, {
    method: 'POST',
    headers: signed.headers,
    body: payload
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`IAM CreateRole failed: ${text}`)
  }

  const arnMatch = text.match(/<Arn>([^<]+)<\/Arn>/)
  if (!arnMatch) {
    throw new Error('Failed to parse role ARN from response')
  }

  return { roleArn: arnMatch[1] }
}

export async function attachRolePolicy(
  creds: AWSCredentials,
  roleName: string,
  policyArn: string
): Promise<void> {
  
  const params = new URLSearchParams({
    'Action': 'AttachRolePolicy',
    'RoleName': roleName,
    'PolicyArn': policyArn,
    'Version': '2010-05-08'
  })

  const payload = params.toString()

  const signed = await signRequest({
    method: 'POST',
    service: 'iam',
    region: 'us-east-1',
    endpoint: 'iam.amazonaws.com',
    path: '/',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
    },
    payload,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken
  })

  const response = await fetch(signed.url, {
    method: 'POST',
    headers: signed.headers,
    body: payload
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`IAM AttachRolePolicy failed: ${text}`)
  }
}
