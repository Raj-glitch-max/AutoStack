// CodeBuild API calls using direct HTTPS (no SDK)
import { signRequest } from './aws-sig-v4.ts'
import type { AWSCredentials } from './aws-client-direct.ts'

export interface CodeBuildProject {
  name: string
  source: {
    type: string
    location: string
    buildspec: string
  }
  environment: {
    type: string
    computeType: string
    image: string
    privilegedMode: boolean
    environmentVariables?: Array<{ name: string; value: string }>
  }
  serviceRole: string
  artifacts: {
    type: string
  }
}

export async function createCodeBuildProject(
  creds: AWSCredentials,
  project: CodeBuildProject
): Promise<{ projectArn: string }> {
  
  const payload = JSON.stringify(project)

  const signed = await signRequest({
    method: 'POST',
    service: 'codebuild',
    region: creds.region,
    endpoint: `codebuild.${creds.region}.amazonaws.com`,
    path: '/',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'CodeBuild_20161006.CreateProject'
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
    if (result.__type === 'ResourceAlreadyExistsException') {
      // Project already exists, return success
      return { projectArn: `arn:aws:codebuild:${creds.region}:*:project/${project.name}` }
    }
    throw new Error(`CodeBuild CreateProject failed: ${JSON.stringify(result)}`)
  }

  return { projectArn: result.project.arn }
}


export async function startBuild(
  creds: AWSCredentials,
  projectName: string,
  sourceVersion?: string
): Promise<{ buildId: string; buildArn: string }> {
  
  const payload = JSON.stringify({
    projectName,
    sourceVersion: sourceVersion || 'main'
  })

  const signed = await signRequest({
    method: 'POST',
    service: 'codebuild',
    region: creds.region,
    endpoint: `codebuild.${creds.region}.amazonaws.com`,
    path: '/',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'CodeBuild_20161006.StartBuild'
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
    throw new Error(`CodeBuild StartBuild failed: ${JSON.stringify(result)}`)
  }

  return {
    buildId: result.build.id,
    buildArn: result.build.arn
  }
}

export async function getBuildStatus(
  creds: AWSCredentials,
  buildId: string
): Promise<{ status: string; phase: string }> {
  
  const payload = JSON.stringify({
    ids: [buildId]
  })

  const signed = await signRequest({
    method: 'POST',
    service: 'codebuild',
    region: creds.region,
    endpoint: `codebuild.${creds.region}.amazonaws.com`,
    path: '/',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'CodeBuild_20161006.BatchGetBuilds'
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

  if (!response.ok || !result.builds || result.builds.length === 0) {
    throw new Error(`CodeBuild BatchGetBuilds failed: ${JSON.stringify(result)}`)
  }

  return {
    status: result.builds[0].buildStatus,
    phase: result.builds[0].currentPhase
  }
}
