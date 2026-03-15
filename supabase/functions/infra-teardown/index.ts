import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'
import {
  STSClient, AssumeRoleCommand,
} from 'npm:@aws-sdk/client-sts@3'
import {
  EKSClient,
  DeleteAddonCommand, DeleteNodegroupCommand, DescribeNodegroupCommand,
  DeleteClusterCommand, DescribeClusterCommand,
  ListNodegroupsCommand, ListAddonsCommand,
} from 'npm:@aws-sdk/client-eks@3'
import {
  EC2Client,
  DeleteVpcCommand, DescribeVpcsCommand,
  DeleteSubnetCommand, DescribeSubnetsCommand,
  DeleteInternetGatewayCommand, DescribeInternetGatewaysCommand,
  DetachInternetGatewayCommand,
  DeleteNatGatewayCommand, DescribeNatGatewaysCommand,
  ReleaseAddressCommand, DescribeAddressesCommand,
  DeleteRouteTableCommand, DescribeRouteTablesCommand,
  DisassociateRouteTableCommand,
  DeleteSecurityGroupCommand, DescribeSecurityGroupsCommand,
} from 'npm:@aws-sdk/client-ec2@3'
import {
  ECRClient,
  DeleteRepositoryCommand, DescribeRepositoriesCommand,
} from 'npm:@aws-sdk/client-ecr@3'
import {
  ElasticLoadBalancingV2Client,
  DeleteLoadBalancerCommand, DescribeLoadBalancersCommand,
  DeleteTargetGroupCommand, DescribeTargetGroupsCommand,
  DeleteListenerCommand, DescribeListenersCommand,
} from 'npm:@aws-sdk/client-elastic-load-balancing-v2@3'
import {
  IAMClient,
  DetachRolePolicyCommand, ListAttachedRolePoliciesCommand,
  DeleteRolePolicyCommand, ListRolePoliciesCommand,
  DeleteRoleCommand, DescribeInstanceProfilesCommand,
  RemoveRoleFromInstanceProfileCommand, DeleteInstanceProfileCommand,
  ListInstanceProfilesForRoleCommand,
} from 'npm:@aws-sdk/client-iam@3'
import {
  CodeBuildClient,
  DeleteProjectCommand, ListProjectsCommand,
} from 'npm:@aws-sdk/client-codebuild@3'
import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} from 'npm:@aws-sdk/client-resource-groups-tagging-api@3'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Tag-based resource discovery ────────────────────────────────────────────
async function findResourcesByTag(
  taggingClient: ResourceGroupsTaggingAPIClient,
  projectId: string
): Promise<string[]> {
  const { ResourceTagMappingList = [] } = await taggingClient.send(
    new GetResourcesCommand({
      TagFilters: [{ Key: 'autostack:project_id', Values: [projectId] }],
    })
  )
  return ResourceTagMappingList.map((r: any) => r.ResourceARN!).filter(Boolean)
}

// ─── Broadcast event to infrastructure_events ─────────────────────────────────
async function broadcast(
  adminSupa: ReturnType<typeof createClient>,
  projectId: string,
  stage: string,
  type: 'started' | 'completed' | 'failed' | 'progress',
  message: string,
  resourceId?: string
) {
  await adminSupa.from('infrastructure_events').insert({
    project_id: projectId,
    stage,
    event_type: type,
    message,
    resource_id: resourceId ?? null,
    resource_type: stage,
  }).then(() => {}).catch((e: Error) => console.error('broadcast failed:', e.message))
}

// ─── Wait for a condition with timeout ───────────────────────────────────────
async function waitFor<T>(
  fn: () => Promise<T>,
  isDone: (v: T) => boolean,
  intervalMs = 15_000,
  timeoutMs = 900_000  // 15 min max per resource
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await fn()
    if (isDone(result)) return result
    await sleep(intervalMs)
  }
  throw new Error('Waitfor timeout exceeded')
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    
    // 1. Validation
    const validationError = validateOrRespond(body, {
        project_id: { type: 'uuid', required: true },
        force: { type: 'boolean', required: false }
    }, corsHeaders)
    if (validationError) return validationError

    const { project_id, force = false } = body

    // 2. Authentication (Internal or JWT)
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const isInternal = token === Deno.env.get('INTERNAL_SECRET')

    let orgId: string | undefined

    if (isInternal) {
        orgId = body.org_id // Trust the calling function if using internal secret
    } else if (token) {
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
        if (authErr || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
        orgId = user.user_metadata?.org_id
    }

    if (!orgId) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Org context missing' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    // 3. Fetch Project
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, org_id, name, provisioning_status, cloud_credential_id, rollback_data, cluster_arn, vpc_id')
      .eq('id', project_id)
      .single()

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (project.org_id !== orgId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (project.provisioning_status === 'deleted') {
      return new Response(JSON.stringify({ success: true, message: 'Already deleted' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!force && project.provisioning_status === 'provisioning') {
      return new Response(JSON.stringify({
        error: 'Provisioning in progress. Pass force: true to abort and teardown.',
        code: 'PROVISIONING_IN_PROGRESS',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 4. Initiate Background Teardown
    await supabase.from('projects').update({ provisioning_status: 'deleting' }).eq('id', project_id)

    // @ts-ignore EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil(runTeardown(supabase, project, project_id))

    return new Response(JSON.stringify({
      success: true,
      message: 'Teardown initiated. Resources will be deleted in the background.',
      project_id,
    }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    const error = err as Error
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ─── Core teardown logic ──────────────────────────────────────────────────────
async function runTeardown(
  adminSupa: ReturnType<typeof createClient>,
  project: Record<string, unknown>,
  projectId: string
) {
  const rollback = (project.rollback_data ?? {}) as Record<string, unknown>
  const region = (rollback.region as string) || Deno.env.get('AWS_REGION') || 'us-east-1'

  const deleted: string[] = []
  const failed: string[] = []
  const skipped: string[] = []

  try {
    // Get cloud credential to assume the user's IAM role
    let awsCreds: { accessKeyId: string; secretAccessKey: string; sessionToken: string } | undefined

    if (project.cloud_credential_id) {
      const { data: cred } = await adminSupa
        .from('cloud_credentials')
        .select('role_arn, account_id, region')
        .eq('id', project.cloud_credential_id as string)
        .single()

      if (cred?.role_arn) {
        const credRegion = cred.region || region
        const sts = new STSClient({ region: credRegion })
        try {
          const { Credentials } = await sts.send(new AssumeRoleCommand({
            RoleArn: cred.role_arn,
            RoleSessionName: `AutoStack-Teardown-${projectId.slice(0, 8)}`,
            ExternalId: project.org_id as string,
            DurationSeconds: 3600,
          }))
          if (Credentials?.AccessKeyId) {
            awsCreds = {
              accessKeyId: Credentials.AccessKeyId,
              secretAccessKey: Credentials.SecretAccessKey!,
              sessionToken: Credentials.SessionToken!,
            }
          }
        } catch (e: unknown) {
          await broadcast(adminSupa, projectId, 'teardown', 'progress',
            `Warning: Could not assume IAM role: ${(e as Error).message}. Will try with default credentials.`)
        }
      }
    }

    const credentialsConfig = awsCreds ? { credentials: awsCreds } : {}
    const eks = new EKSClient({ region, ...credentialsConfig })
    const ec2 = new EC2Client({ region, ...credentialsConfig })
    const ecr = new ECRClient({ region, ...credentialsConfig })
    const elb = new ElasticLoadBalancingV2Client({ region, ...credentialsConfig })
    const iam = new IAMClient({ region: 'us-east-1', ...credentialsConfig }) // IAM is global
    const codebuild = new CodeBuildClient({ region, ...credentialsConfig })
    const tagging = new ResourceGroupsTaggingAPIClient({ region, ...credentialsConfig })

    await broadcast(adminSupa, projectId, 'teardown', 'started', 'Starting infrastructure teardown...')

    // ── STEP 1: Delete EKS node groups (must drain before cluster deletion) ──
    const clusterArn = (rollback.cluster_arn ?? project.cluster_arn) as string | undefined
    const clusterName = clusterArn?.split('/').pop()

    if (clusterName) {
      await broadcast(adminSupa, projectId, 'teardown', 'progress', `Deleting EKS node groups for cluster: ${clusterName}`)

      try {
        // First delete all addons
        const { addons = [] } = await eks.send(new ListAddonsCommand({ clusterName }))
        for (const addonName of addons) {
          try {
            await eks.send(new DeleteAddonCommand({ clusterName, addonName }))
            deleted.push(`addon:${addonName}`)
          } catch { /* ignore — addon may already be gone */ }
        }

        // Delete all node groups
        const { nodegroups = [] } = await eks.send(new ListNodegroupsCommand({ clusterName }))
        for (const nodegroupName of nodegroups) {
          try {
            await eks.send(new DeleteNodegroupCommand({ clusterName, nodegroupName }))
            // Wait for deletion
            await waitFor(
              () => eks.send(new DescribeNodegroupCommand({ clusterName, nodegroupName })),
              () => false,  // keep waiting until it throws (resource not found = deleted)
              20_000,
              600_000
            ).catch(() => { /* throws when deleted — that's success */ })
            deleted.push(`nodegroup:${nodegroupName}`)
          } catch { skipped.push(`nodegroup:${nodegroupName}`) }
        }

        // ── STEP 2: Delete EKS cluster ──
        await broadcast(adminSupa, projectId, 'teardown', 'progress', `Deleting EKS cluster: ${clusterName}`)
        try {
          await eks.send(new DeleteClusterCommand({ name: clusterName }))
          await waitFor(
            () => eks.send(new DescribeClusterCommand({ name: clusterName })),
            () => false,
            30_000,
            900_000
          ).catch(() => { /* deleted */ })
          deleted.push(`eks:${clusterName}`)
        } catch (e: unknown) {
          if (!(e as Error).message?.includes('not found')) {
            failed.push(`eks:${clusterName}`)
            await broadcast(adminSupa, projectId, 'teardown', 'progress', `EKS cluster deletion error: ${(e as Error).message}`)
          }
        }
      } catch (e: unknown) {
        await broadcast(adminSupa, projectId, 'teardown', 'progress', `EKS step error: ${(e as Error).message}`)
      }
    }

    // ── STEP 3: Delete Load Balancers ──
    await broadcast(adminSupa, projectId, 'teardown', 'progress', 'Deleting load balancers...')
    try {
      const albArns = ((rollback.alb_arns ?? []) as string[])
      // Also find by tag
      const taggedResources = await findResourcesByTag(tagging, projectId)
      const albArnsByTag = taggedResources.filter(arn => arn.includes(':loadbalancer/'))

      for (const albArn of [...new Set([...albArns, ...albArnsByTag])]) {
        try {
          // Delete listeners first
          const { Listeners = [] } = await elb.send(new DescribeListenersCommand({ LoadBalancerArn: albArn }))
          for (const listener of Listeners) {
            await elb.send(new DeleteListenerCommand({ ListenerArn: listener.ListenerArn! }))
          }
          // Delete target groups
          const { TargetGroups = [] } = await elb.send(new DescribeTargetGroupsCommand({ LoadBalancerArn: albArn }))
          await elb.send(new DeleteLoadBalancerCommand({ LoadBalancerArn: albArn }))
          deleted.push(`alb:${albArn}`)
          for (const tg of TargetGroups) {
            try { await elb.send(new DeleteTargetGroupCommand({ TargetGroupArn: tg.TargetGroupArn! })) } catch { /* ignore */ }
            deleted.push(`tg:${tg.TargetGroupArn}`)
          }
        } catch (e: unknown) {
          if (!(e as Error).message?.includes('not found')) failed.push(`alb:${albArn}`)
        }
      }
    } catch (e: unknown) {
      await broadcast(adminSupa, projectId, 'teardown', 'progress', `ALB step error: ${(e as Error).message}`)
    }

    // ── STEP 4: Delete NAT Gateways (must be before subnets/IGW) ──
    await broadcast(adminSupa, projectId, 'teardown', 'progress', 'Deleting NAT gateways...')
    const natGwIds = ((rollback.nat_gateway_ids ?? []) as string[])
    const pendingEipAllocIds: string[] = ((rollback.elastic_ip_alloc_ids ?? []) as string[])

    for (const natGwId of natGwIds) {
      try {
        await ec2.send(new DeleteNatGatewayCommand({ NatGatewayId: natGwId }))
        // Wait for deleted state
        await waitFor(
          () => ec2.send(new DescribeNatGatewaysCommand({ NatGatewayIds: [natGwId] })),
          (r) => r.NatGateways?.[0]?.State === 'deleted',
          15_000,
          300_000
        )
        deleted.push(`natgw:${natGwId}`)
      } catch { skipped.push(`natgw:${natGwId}`) }
    }

    // Release Elastic IPs after NAT GWs are deleted
    for (const allocId of pendingEipAllocIds) {
      try {
        await ec2.send(new ReleaseAddressCommand({ AllocationId: allocId }))
        deleted.push(`eip:${allocId}`)
      } catch { skipped.push(`eip:${allocId}`) }
    }

    // ── STEP 5: Delete Internet Gateway ──
    const igwId = rollback.internet_gateway_id as string | undefined
    const vpcId = (rollback.vpc_id ?? project.vpc_id) as string | undefined

    if (igwId && vpcId) {
      try {
        await ec2.send(new DetachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }))
        await ec2.send(new DeleteInternetGatewayCommand({ InternetGatewayId: igwId }))
        deleted.push(`igw:${igwId}`)
      } catch { skipped.push(`igw:${igwId}`) }
    }

    // ── STEP 6: Delete route tables (non-main) ──
    const rtIds = ((rollback.route_table_ids ?? []) as string[])
    for (const rtId of rtIds) {
      try {
        // Disassociate all explicit subnet associations first
        const { RouteTables = [] } = await ec2.send(new DescribeRouteTablesCommand({ RouteTableIds: [rtId] }))
        for (const rt of RouteTables) {
          for (const assoc of rt.Associations ?? []) {
            if (!assoc.Main && assoc.RouteTableAssociationId) {
              await ec2.send(new DisassociateRouteTableCommand({ AssociationId: assoc.RouteTableAssociationId }))
            }
          }
        }
        await ec2.send(new DeleteRouteTableCommand({ RouteTableId: rtId }))
        deleted.push(`rt:${rtId}`)
      } catch { skipped.push(`rt:${rtId}`) }
    }

    // ── STEP 7: Delete subnets ──
    await broadcast(adminSupa, projectId, 'teardown', 'progress', 'Deleting subnets...')
    const subnetIds = ((rollback.subnet_ids ?? []) as string[])
    for (const subnetId of subnetIds) {
      try {
        await ec2.send(new DeleteSubnetCommand({ SubnetId: subnetId }))
        deleted.push(`subnet:${subnetId}`)
      } catch { skipped.push(`subnet:${subnetId}`) }
    }

    // ── STEP 8: Delete security groups ──
    const sgIds = ((rollback.security_group_ids ?? []) as string[])
    for (const sgId of sgIds) {
      try {
        await ec2.send(new DeleteSecurityGroupCommand({ GroupId: sgId }))
        deleted.push(`sg:${sgId}`)
      } catch { skipped.push(`sg:${sgId}`) }
    }

    // ── STEP 9: Delete VPC ──
    await broadcast(adminSupa, projectId, 'teardown', 'progress', 'Deleting VPC...')
    if (vpcId) {
      try {
        await ec2.send(new DeleteVpcCommand({ VpcId: vpcId }))
        deleted.push(`vpc:${vpcId}`)
      } catch (e: unknown) {
        failed.push(`vpc:${vpcId}`)
        await broadcast(adminSupa, projectId, 'teardown', 'progress', `VPC deletion failed: ${(e as Error).message}`)
      }
    }

    // ── STEP 10: Delete ECR repository ──
    const ecrRepoName = rollback.ecr_repo_name as string | undefined
    if (ecrRepoName) {
      try {
        await ecr.send(new DeleteRepositoryCommand({ repositoryName: ecrRepoName, force: true }))
        deleted.push(`ecr:${ecrRepoName}`)
      } catch { skipped.push(`ecr:${ecrRepoName}`) }
    }

    // ── STEP 11: Delete CodeBuild project ──
    const codebuildProjectName = rollback.codebuild_project_name as string | undefined
    if (codebuildProjectName) {
      try {
        await codebuild.send(new DeleteProjectCommand({ name: codebuildProjectName }))
        deleted.push(`codebuild:${codebuildProjectName}`)
      } catch { skipped.push(`codebuild:${codebuildProjectName}`) }
    }

    // ── STEP 12: Delete AutoStack-created IAM roles ──
    const iamRoleNames = ((rollback.iam_role_names ?? []) as string[])
    for (const roleName of iamRoleNames) {
      try {
        // Detach managed policies
        const { AttachedPolicies = [] } = await iam.send(
          new ListAttachedRolePoliciesCommand({ RoleName: roleName })
        )
        for (const p of AttachedPolicies) {
          await iam.send(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: p.PolicyArn! }))
        }
        // Delete inline policies
        const { PolicyNames = [] } = await iam.send(new ListRolePoliciesCommand({ RoleName: roleName }))
        for (const pName of PolicyNames) {
          await iam.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: pName }))
        }
        // Remove from instance profiles
        const { InstanceProfiles = [] } = await iam.send(
          new ListInstanceProfilesForRoleCommand({ RoleName: roleName })
        )
        for (const profile of InstanceProfiles) {
          await iam.send(new RemoveRoleFromInstanceProfileCommand({
            RoleName: roleName,
            InstanceProfileName: profile.InstanceProfileName!,
          }))
          await iam.send(new DeleteInstanceProfileCommand({
            InstanceProfileName: profile.InstanceProfileName!,
          }))
        }
        await iam.send(new DeleteRoleCommand({ RoleName: roleName }))
        deleted.push(`iam:${roleName}`)
      } catch { skipped.push(`iam:${roleName}`) }
    }

    // ── STEP 13: Final tag-based sweep — catch any missed resources ──
    await broadcast(adminSupa, projectId, 'teardown', 'progress', 'Running final orphan check...')
    const remaining = await findResourcesByTag(tagging, projectId)
    if (remaining.length > 0) {
      await broadcast(adminSupa, projectId, 'teardown', 'progress',
        `⚠️ ${remaining.length} resources still found with project tag after teardown: ${remaining.join(', ')}`)
      for (const arn of remaining) failed.push(`orphan:${arn}`)
    }

    // ── Update project and cluster status in DB ──
    await adminSupa.from('projects').update({
      provisioning_status: 'deleted',
      live_url: null,
      cluster_arn: null,
      vpc_id: null,
      ecr_repo_url: null,
      alb_dns_name: null,
    }).eq('id', projectId)

    await adminSupa.from('clusters')
      .update({ agent_status: 'disconnected' })
      .eq('org_id', project.org_id as string)

    // Audit log
    await adminSupa.from('audit_log').insert({
      org_id: project.org_id as string,
      actor_type: 'user',
      actor_id: 'system',
      actor_name: 'AutoStack',
      action: 'environment.deleted',
      target_type: 'project',
      target_id: projectId,
      metadata: {
        deleted_count: deleted.length,
        failed_count: failed.length,
        skipped_count: skipped.length,
        project_name: project.name,
      },
    })

    const summary = `Teardown complete. Deleted: ${deleted.length} resources. Failed: ${failed.length}. Skipped: ${skipped.length}.`
    await broadcast(adminSupa, projectId, 'teardown', 'completed', summary)

    if (failed.length > 0) {
      await broadcast(adminSupa, projectId, 'teardown', 'failed',
        `Some resources could not be deleted: ${failed.join(', ')}. Check AWS console manually.`)
    }

  } catch (err: unknown) {
    const error = err as Error
    console.error('infra-teardown fatal error:', error.message)
    await broadcast(adminSupa, projectId, 'teardown', 'failed', `Teardown error: ${error.message}`)
    await adminSupa.from('projects').update({ provisioning_status: 'failed' }).eq('id', projectId)
  }
}
