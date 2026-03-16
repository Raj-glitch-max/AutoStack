import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getOrgAWSCredentials, trackResource, setStage, appendLog } from '../_shared/aws-client-direct.ts'
import { createECRRepository, describeECRRepository } from '../_shared/aws-ecr-api.ts'
import { getIAMRole, createIAMRole, attachRolePolicy } from '../_shared/aws-iam-api.ts'
import { createCodeBuildProject } from '../_shared/aws-codebuild-api.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { deployment_id, org_id, classification, dockerfile_content, github_repo_url, branch } = await req.json()

    console.log('[1] Setup build pipeline for deployment:', deployment_id)

    // Get deployment details
    const { data: deployment } = await supabase
      .from('deployments')
      .select('*')
      .eq('id', deployment_id)
      .single()

    if (!deployment) {
      throw new Error('Deployment not found')
    }

    const region = deployment.region || 'us-east-1'
    const appName = sanitizeAppName(deployment.app_name || github_repo_url.split('/').pop())

    console.log('[2] Getting AWS credentials for org:', org_id)

    // Get AWS credentials using direct API (no SDK)
    const awsCreds = await getOrgAWSCredentials(org_id, null, supabase)

    console.log('[3] AWS credentials obtained, region:', awsCreds.region)

    // ─── STEP 1: Create ECR Repository ────────────────────────────────────────
    await setStage(supabase, deployment_id, 'provisioning_infra')
    await appendLog(supabase, deployment_id, '▶ Creating container registry (ECR)...', 'step')

    const repoName = `autostack/${appName}`
    let repositoryUri: string
    let repositoryArn: string

    console.log('[4] Creating ECR repository:', repoName)

    try {
      // Try to create repository
      const result = await createECRRepository(awsCreds, repoName)
      repositoryUri = result.repositoryUri
      repositoryArn = result.repositoryArn
      
      await trackResource(supabase, deployment_id, org_id, 'ecr', repoName, repositoryArn, region)
      await appendLog(supabase, deployment_id, `✓ ECR repository created: ${repositoryUri}`, 'success')
      console.log('[5] ECR repository created:', repositoryUri)
    } catch (error: any) {
      // If already exists, get it
      if (error.message.includes('already exists') || error.message.includes('RepositoryAlreadyExists')) {
        const result = await describeECRRepository(awsCreds, repoName)
        repositoryUri = result.repositoryUri
        repositoryArn = result.repositoryArn
        await appendLog(supabase, deployment_id, `✓ Using existing ECR repository: ${repositoryUri}`, 'success')
        console.log('[5] Using existing ECR repository:', repositoryUri)
      } else {
        throw error
      }
    }

    await supabase.from('deployments').update({ ecr_repository_uri: repositoryUri }).eq('id', deployment_id)

    // ─── STEP 2: Create CodeBuild Service Role ─────────────────────────────────
    await appendLog(supabase, deployment_id, '▶ Setting up build service role...', 'step')

    const roleName = 'AutoStackCodeBuildRole'
    let codeBuildRoleArn: string

    console.log('[6] Checking for IAM role:', roleName)

    const existingRole = await getIAMRole(awsCreds, roleName)
    
    if (existingRole) {
      codeBuildRoleArn = existingRole.roleArn
      await appendLog(supabase, deployment_id, `✓ Using existing IAM role: ${roleName}`, 'success')
      console.log('[7] Using existing IAM role:', codeBuildRoleArn)
    } else {
      console.log('[7] Creating new IAM role:', roleName)
      
      const trustPolicy = {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: 'codebuild.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }]
      }

      const role = await createIAMRole(
        awsCreds,
        roleName,
        JSON.stringify(trustPolicy),
        'AutoStack CodeBuild service role'
      )
      codeBuildRoleArn = role.roleArn

      // Attach required policies
      await attachRolePolicy(awsCreds, roleName, 'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser')
      await attachRolePolicy(awsCreds, roleName, 'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess')

      await appendLog(supabase, deployment_id, `✓ IAM role created: ${roleName}`, 'success')
      console.log('[8] IAM role created:', codeBuildRoleArn)
      
      // Wait for IAM propagation
      await appendLog(supabase, deployment_id, '  Waiting for IAM role propagation (10s)...', 'info')
      await new Promise(r => setTimeout(r, 10000))
    }

    // ─── STEP 3: Create CodeBuild Project ──────────────────────────────────────
    await appendLog(supabase, deployment_id, '▶ Creating build pipeline (CodeBuild)...', 'step')

    const projectName = `autostack-${appName}-${deployment_id.slice(0, 8)}`
    const buildSpec = generateBuildSpec(repositoryUri, classification.port, dockerfile_content)

    console.log('[9] Creating CodeBuild project:', projectName)

    try {
      const project = await createCodeBuildProject(awsCreds, {
        name: projectName,
        source: {
          type: 'GITHUB',
          location: github_repo_url,
          buildspec: buildSpec
        },
        environment: {
          type: 'LINUX_CONTAINER',
          computeType: getComputeType(classification),
          image: 'aws/codebuild/standard:7.0',
          privilegedMode: true,
          environmentVariables: [
            { name: 'AWS_DEFAULT_REGION', value: region },
            { name: 'ECR_REPO_URI', value: repositoryUri },
            { name: 'APP_PORT', value: String(classification.port) }
          ]
        },
        serviceRole: codeBuildRoleArn,
        artifacts: { type: 'NO_ARTIFACTS' }
      })

      await trackResource(supabase, deployment_id, org_id, 'codebuild', projectName, project.projectArn, region)
      await appendLog(supabase, deployment_id, `✓ Build pipeline ready: ${projectName}`, 'success')
      console.log('[10] CodeBuild project created:', project.projectArn)
    } catch (error: any) {
      if (error.message.includes('already exists') || error.message.includes('ResourceAlreadyExists')) {
        await appendLog(supabase, deployment_id, `✓ Using existing build pipeline: ${projectName}`, 'success')
        console.log('[10] Using existing CodeBuild project:', projectName)
      } else {
        throw error
      }
    }

    await supabase.from('deployments').update({ codebuild_project_name: projectName }).eq('id', deployment_id)

    console.log('[11] Build pipeline setup complete')

    return new Response(JSON.stringify({
      success: true,
      ecr_repository_uri: repositoryUri,
      ecr_repository_arn: repositoryArn,
      codebuild_project_name: projectName,
      codebuild_role_arn: codeBuildRoleArn,
      message: 'Build pipeline setup complete'
    }), { 
      status: 200, 
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
    })

  } catch (err: any) {
    console.error('[setup-build-pipeline] Error:', err)
    return new Response(JSON.stringify({ 
      success: false, 
      error: err.message,
      stack: err.stack
    }), { 
      status: 500, 
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
    })
  }
})

function sanitizeAppName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
}

function generateBuildSpec(repositoryUri: string, port: number, dockerfileContent: string): string {
  return JSON.stringify({
    version: '0.2',
    phases: {
      pre_build: {
        commands: [
          'echo "AutoStack Build Pipeline"',
          'IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)',
          'echo "Building image tag: $IMAGE_TAG"',
          `aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin ${repositoryUri.split('/')[0]}`,
          `cat << 'DOCKERFILE_EOF' > Dockerfile\n${dockerfileContent}\nDOCKERFILE_EOF`
        ]
      },
      build: {
        commands: [
          'echo "Building Docker image..."',
          `docker build --build-arg PORT=${port} -t ${repositoryUri}:$IMAGE_TAG -t ${repositoryUri}:latest .`
        ]
      },
      post_build: {
        commands: [
          `docker push ${repositoryUri}:$IMAGE_TAG`,
          `docker push ${repositoryUri}:latest`,
          `echo "IMAGE_URI=${repositoryUri}:$IMAGE_TAG" > imageUri.env`,
          'echo "Build complete. Image pushed to ECR."'
        ]
      }
    },
    artifacts: {
      files: ['imageUri.env']
    }
  })
}

function getComputeType(classification: any): string {
  if (classification.language === 'Java') return 'BUILD_GENERAL1_MEDIUM'
  if (classification.estimatedMemory > 1024) return 'BUILD_GENERAL1_MEDIUM'
  return 'BUILD_GENERAL1_SMALL'
}
