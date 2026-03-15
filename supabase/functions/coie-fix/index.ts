import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'

const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN')

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
        finding_id: { type: 'uuid', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { finding_id } = body

    // 2. Auth Check (Internal or JWT)
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const isInternal = token === Deno.env.get('INTERNAL_SECRET')

    if (!isInternal && token) {
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
        if (authErr || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
    } else if (!isInternal) {
         return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
    }

    console.log(`[COIE Fix] Processing finding: ${finding_id}`)

    // 3. Fetch Finding and Project Context
    const { data: finding, error: findErr } = await supabase.from('findings').select('*, cluster_id, project_id').eq('id', finding_id).single()
    if (findErr || !finding) throw new Error('Finding not found')

    const { data: project, error: projectErr } = await supabase.from('projects').select('*').eq('id', finding.project_id).single()
    if (projectErr || !project) throw new Error('Project not found')

    const { data: org } = await supabase.from('organizations').select('plan').eq('id', project.org_id).single()
    if (!org || !['pro', 'enterprise'].includes(org.plan.toLowerCase())) {
        return new Response(JSON.stringify({ error: 'Auto-remediation requires Pro or Enterprise plan' }), { 
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const [owner, repo] = project.repo_url.split('github.com/')[1].split('/')

    // 4. Read Manifest
    const manifestPath = finding.affected_resource_path || 'autostack/k8s/deployment.yaml'
    
    const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${manifestPath}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'AutoStack-Fix' }
    })
    
    if (!fileRes.ok) throw new Error(`GitHub API error: ${fileRes.statusText}`)
    
    const fileData = await fileRes.json()
    let manifest = atob(fileData.content)

    // 5. Apply Fixes
    let fixApplied = false
    let commitMessage = `fix: resolve AutoStack finding ${finding.check_id}`

    switch (finding.check_id) {
      case 'MISSING_RESOURCES':
        if (!manifest.includes('resources:')) {
          manifest = manifest.replace(
            /image: (.*)/,
            `image: $1\n        resources:\n          limits:\n            cpu: 500m\n            memory: 512Mi\n          requests:\n            cpu: 200m\n            memory: 256Mi`
          )
          fixApplied = true
        }
        break
      case 'SINGLE_REPLICA':
        if (manifest.includes('replicas: 1')) {
          manifest = manifest.replace('replicas: 1', 'replicas: 2')
          fixApplied = true
        }
        break
      case 'PRIVILEGED_CONTAINER':
        if (manifest.includes('privileged: true')) {
          manifest = manifest.replace('privileged: true', 'privileged: false')
          fixApplied = true
        }
        break
    }

    if (!fixApplied) {
      return new Response(JSON.stringify({ status: 'skipped', reason: 'Fix logic already applied or not applicable' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 6. Create Branch and PR
    const branchName = `autostack/fix-${finding.check_id.toLowerCase()}-${Date.now().toString().slice(-4)}`
    
    const repoInfoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'AutoStack-Fix' }
    })
    const repoInfo = await repoInfoRes.json()
    const defaultBranch = repoInfo.default_branch || 'main'

    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'AutoStack-Fix' }
    })
    const refData = await refRes.json()
    const baseSha = refData.object.sha

    // Create Branch
    await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'AutoStack-Fix' },
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha })
    })

    // Update File
    await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${manifestPath}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'AutoStack-Fix' },
      body: JSON.stringify({
        message: commitMessage,
        content: btoa(manifest),
        sha: fileData.sha,
        branch: branchName
      })
    })

    // Open PR
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'AutoStack-Fix' },
      body: JSON.stringify({
        title: `🔧 AutoStack Fix: ${finding.title}`,
        head: branchName,
        base: defaultBranch,
        body: `## Automated Infrastructure Fix\n\nAutoStack identified a **${finding.severity}** severity finding:\n> ${finding.description}\n\n### Proposed Change:\n${finding.remediation}\n\nThis PR was automatically generated to address the issue.`
      })
    })
    const prData = await prRes.json()

    // 7. Update Finding
    await supabase.from('findings').update({
      pr_url: prData.html_url,
      status: 'pending_review'
    }).eq('id', finding_id)

    return new Response(JSON.stringify({ success: true, pr_url: prData.html_url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error(`[COIE Fix] Error:`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
