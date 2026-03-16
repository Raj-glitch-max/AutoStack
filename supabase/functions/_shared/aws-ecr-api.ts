// ECR API calls using direct HTTPS (no SDK)
import { signRequest } from './aws-sig-v4.ts'
import type { AWSCredentials } from './aws-client-direct.ts'

export async function createECRRepository(
  creds: AWSCredentials,
  repositoryName: string
): Promise<{ repositoryUri: string; repositoryArn: string }> {
  
  const payload = JSON.stringify({
    repositoryName,
    imageScanningConfiguration: { scanOnPush: true },
    imageTagMutability: 'MUTABLE'
  })

  const signed = await signRequest({
    method: 'POST',
    service: 'ecr',
    region: creds.region,
    endpoint: `ecr.${creds.region}.amazonaws.com`,
    path: '/',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'AmazonEC2ContainerRegistry_V20150921.CreateRepository'
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
    // Check if repository already exists
    if (result.__type === 'RepositoryAlreadyExistsException') {
      // Get existing repository
      return await describeECRRepository(creds, repositoryName)
    }
    throw new Error(`ECR CreateRepository failed: ${JSON.stringify(result)}`)
  }

  return {
    repositoryUri: result.repository.repositoryUri,
    repositoryArn: result.repository.repositoryArn
  }
}

export async function describeECRRepository(
  creds: AWSCredentials,
  repositoryName: string
): Promise<{ repositoryUri: string; repositoryArn: string }> {
  
  const payload = JSON.stringify({
    repositoryNames: [repositoryName]
  })

  const signed = await signRequest({
    method: 'POST',
    service: 'ecr',
    region: creds.region,
    endpoint: `ecr.${creds.region}.amazonaws.com`,
    path: '/',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'AmazonEC2ContainerRegistry_V20150921.DescribeRepositories'
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

  if (!response.ok || !result.repositories || result.repositories.length === 0) {
    throw new Error(`ECR repository ${repositoryName} not found`)
  }

  return {
    repositoryUri: result.repositories[0].repositoryUri,
    repositoryArn: result.repositories[0].repositoryArn
  }
}
