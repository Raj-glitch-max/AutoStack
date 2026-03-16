// App Runner API calls using direct HTTPS (no SDK)
import { signRequest } from './aws-sig-v4.ts'
import type { AWSCredentials } from './aws-client-direct.ts'

export interface AppRunnerService {
  serviceName: string
  sourceConfiguration: {
    imageRepository: {
      imageIdentifier: string
      imageRepositoryType: string
      imageConfiguration?: {
        port?: string
        runtimeEnvironmentVariables?: Record<string, string>
      }
    }
    autoDeploymentsEnabled: boolean
  }
  instanceConfiguration: {
    cpu: string
    memory: string
  }
  healthCheckConfiguration?: {
    protocol: string
    path: string
    interval?: number
    timeout?: number
    healthyThreshold?: number
    unhealthyThreshold?: number
  }
}

export async function createAppRunnerService(
  creds: AWSCredentials,
  service: AppRunnerService
): Promise<{ serviceArn: string; serviceId: string; serviceUrl: string }> {
  
  const payload = JSON.stringify(service)

  const signed = await signRequest({
    method: 'POST',
    service: 'apprunner',
    region: creds.region,
    endpoint: `apprunner.${creds.region}.amazonaws.com`,
    path: '/',
    headers: {
      'content-type': 'application/x-amz-json-1.0',
      'x-amz-target': 'AppRunner.CreateService'
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

  const result = await response.json()

  if (!response.ok) {
    throw new Error(`App Runner CreateService failed: ${JSON.stringify(result)}`)
  }

  return {
    serviceArn: result.Service.ServiceArn,
    serviceId: result.Service.ServiceId,
    serviceUrl: result.Service.ServiceUrl
  }
}


export async function describeAppRunnerService(
  creds: AWSCredentials,
  serviceArn: string
): Promise<{ status: string; serviceUrl: string }> {
  
  const payload = JSON.stringify({
    ServiceArn: serviceArn
  })

  const signed = await signRequest({
    method: 'POST',
    service: 'apprunner',
    region: creds.region,
    endpoint: `apprunner.${creds.region}.amazonaws.com`,
    path: '/',
    headers: {
      'content-type': 'application/x-amz-json-1.0',
      'x-amz-target': 'AppRunner.DescribeService'
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

  const result = await response.json()

  if (!response.ok) {
    throw new Error(`App Runner DescribeService failed: ${JSON.stringify(result)}`)
  }

  return {
    status: result.Service.Status,
    serviceUrl: result.Service.ServiceUrl
  }
}

export async function deleteAppRunnerService(
  creds: AWSCredentials,
  serviceArn: string
): Promise<void> {
  
  const payload = JSON.stringify({
    ServiceArn: serviceArn
  })

  const signed = await signRequest({
    method: 'POST',
    service: 'apprunner',
    region: creds.region,
    endpoint: `apprunner.${creds.region}.amazonaws.com`,
    path: '/',
    headers: {
      'content-type': 'application/x-amz-json-1.0',
      'x-amz-target': 'AppRunner.DeleteService'
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
    const result = await response.json()
    throw new Error(`App Runner DeleteService failed: ${JSON.stringify(result)}`)
  }
}

export async function createAccessRole(
  creds: AWSCredentials,
  roleName: string
): Promise<{ roleArn: string }> {
  // This creates an IAM role that allows App Runner to access ECR
  const trustPolicy = {
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { Service: 'build.apprunner.amazonaws.com' },
      Action: 'sts:AssumeRole'
    }]
  }

  // We'll use the IAM API we already created
  const { signRequest: sign } = await import('./aws-sig-v4.ts')
  
  const params = new URLSearchParams({
    'Action': 'CreateRole',
    'RoleName': roleName,
    'AssumeRolePolicyDocument': JSON.stringify(trustPolicy),
    'Description': 'AutoStack App Runner ECR access role',
    'Version': '2010-05-08'
  })

  const payload = params.toString()

  const signed = await sign({
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
    // Check if role already exists
    if (text.includes('EntityAlreadyExists')) {
      // Get existing role
      const arnMatch = text.match(/arn:aws:iam::\d+:role\/[^<\s]+/)
      if (arnMatch) {
        return { roleArn: arnMatch[0] }
      }
    }
    throw new Error(`IAM CreateRole failed: ${text}`)
  }

  const arnMatch = text.match(/<Arn>([^<]+)<\/Arn>/)
  if (!arnMatch) {
    throw new Error('Failed to parse role ARN from response')
  }

  // Attach ECR read policy
  const attachParams = new URLSearchParams({
    'Action': 'AttachRolePolicy',
    'RoleName': roleName,
    'PolicyArn': 'arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess',
    'Version': '2010-05-08'
  })

  const attachPayload = attachParams.toString()
  const attachSigned = await sign({
    method: 'POST',
    service: 'iam',
    region: 'us-east-1',
    endpoint: 'iam.amazonaws.com',
    path: '/',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
    },
    payload: attachPayload,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken
  })

  await fetch(attachSigned.url, {
    method: 'POST',
    headers: attachSigned.headers,
    body: attachPayload
  })

  return { roleArn: arnMatch[1] }
}
