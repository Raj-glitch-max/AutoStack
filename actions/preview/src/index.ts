import * as core from '@actions/core'
import * as github from '@actions/github'

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    const stagingEnvironment = core.getInput('staging_environment', { required: true })

    const apiBase = process.env.AUTOSTACK_API_URL || 'https://api.autostack.io'
    const context = github.context

    // Only run on pull_request events
    if (context.eventName !== 'pull_request') {
      core.info('⏭️  Skipping: not a pull_request event')
      return
    }

    const pr = context.payload.pull_request
    if (!pr) {
      core.setFailed('No pull request found in context')
      return
    }

    const prNumber = pr.number
    const prAction = context.payload.action
    const previewName = `pr-${prNumber}`

    // Handle PR closed: destroy preview
    if (prAction === 'closed') {
      core.info(`🗑️  PR closed: destroying preview ${previewName}`)
      
      const destroyResp = await fetch(`${apiBase}/functions/v1/deploy-preview`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          preview_name: previewName,
          staging_environment: stagingEnvironment
        })
      })

      if (!destroyResp.ok) {
        core.warning(`Failed to destroy preview: ${destroyResp.statusText}`)
        return
      }

      // Update PR comment
      await updatePRComment(token, context, prNumber, `
## 🚀 AutoStack Preview

**Preview environment cleaned up** ✅

This preview was automatically destroyed when the PR was closed.
      `)

      return
    }

    // Handle PR opened/synchronize: create/update preview
    core.info(`🚀 Creating preview environment: ${previewName}`)

    const response = await fetch(`${apiBase}/functions/v1/deploy-preview`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        preview_name: previewName,
        staging_environment: stagingEnvironment,
        commit_sha: pr.head.sha,
        commit_msg: pr.title,
        pr_number: prNumber,
        pr_url: pr.html_url,
        branch: pr.head.ref
      })
    })

    if (!response.ok) {
      const err = await response.json()
      core.setFailed(`Preview deployment failed: ${err.error || response.statusText}`)
      return
    }

    const { preview_url, deployment_id, estimated_cost } = await response.json()

    core.info(`✅ Preview created: ${preview_url}`)
    core.setOutput('preview_url', preview_url)
    core.setOutput('deployment_id', deployment_id)

    // Post comment on PR
    const startTime = Date.now()
    const comment = `
## 🚀 AutoStack Preview

**Environment:** \`${previewName}\` | **Region:** \`us-east-1\`

✅ **Live:** ${preview_url}

⚡ Deployed in ${Math.round((Date.now() - startTime) / 1000)}s  
💰 Estimated cost: ~$${estimated_cost || 0}/mo (namespace-isolated, no extra infra)

---
*This preview environment will be automatically destroyed when the PR is closed.*
    `

    await updatePRComment(token, context, prNumber, comment)

  } catch (err: any) {
    core.setFailed(err.message)
  }
}

async function updatePRComment(
  token: string,
  context: typeof github.context,
  prNumber: number,
  body: string
) {
  try {
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN || token)

    // Find existing AutoStack comment
    const { data: comments } = await octokit.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber
    })

    const existingComment = comments.find(c => 
      c.body?.includes('🚀 AutoStack Preview') && 
      c.user?.type === 'Bot'
    )

    if (existingComment) {
      // Update existing comment
      await octokit.rest.issues.updateComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: existingComment.id,
        body
      })
    } else {
      // Create new comment
      await octokit.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
        body
      })
    }
  } catch (err: any) {
    core.warning(`Failed to update PR comment: ${err.message}`)
  }
}

run().catch(err => core.setFailed(err.message))
