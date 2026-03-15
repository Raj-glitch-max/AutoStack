import * as core from '@actions/core'
import * as github from '@actions/github'

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    const environment = core.getInput('environment', { required: true })
    const wait = core.getInput('wait') !== 'false'
    const timeoutMinutes = parseInt(core.getInput('timeout') || '15')

    const apiBase = process.env.AUTOSTACK_API_URL || 'https://api.autostack.io'
    const startTime = Date.now()

    // Get context from GitHub Actions environment
    const context = github.context
    const commitSha = context.sha
    const repoUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}`
    const branch = context.ref.replace('refs/heads/', '')

    core.info(`🚀 AutoStack: deploying ${repoUrl} (${branch}@${commitSha.slice(0, 7)}) → ${environment}`)

    // POST to AutoStack API: trigger redeploy
    const response = await fetch(`${apiBase}/functions/v1/deploy-redeploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        environment,
        commit_sha: commitSha,
        commit_msg: process.env.GITHUB_COMMIT_MESSAGE || context.eventName,
        triggered_by: 'github_actions',
        repo_url: repoUrl,
        branch
      })
    })

    if (!response.ok) {
      const err = await response.json()
      core.setFailed(`AutoStack deploy failed: ${err.error || response.statusText}`)
      return
    }

    const { deployment_id, project_id } = await response.json()
    core.info(`📋 Deployment ID: ${deployment_id}`)

    if (!wait) {
      core.setOutput('deployment_id', deployment_id)
      core.info('⚡ Returning immediately (wait: false)')
      return
    }

    // Poll for completion
    core.info('⏳ Waiting for deployment to complete...')
    const timeoutMs = timeoutMinutes * 60 * 1000
    const pollInterval = 15000  // 15 seconds
    let elapsed = 0

    while (elapsed < timeoutMs) {
      await new Promise(r => setTimeout(r, pollInterval))
      elapsed += pollInterval

      const statusResp = await fetch(`${apiBase}/functions/v1/api-environments/${project_id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!statusResp.ok) continue

      const env = await statusResp.json()

      // Print progress to GitHub Actions log
      core.info(`   ${env.die_stage || env.provisioning_status} (${Math.round(elapsed / 1000)}s elapsed)`)

      if (env.provisioning_status === 'live') {
        const duration = Math.round((Date.now() - startTime) / 1000)
        core.info(`✅ Deployment complete in ${duration}s`)
        core.info(`🌐 Live URL: ${env.live_url}`)
        core.info(`💰 Est. cost: ${env.estimated_monthly_cost}/mo`)

        // Set outputs for use in subsequent steps
        core.setOutput('live_url', env.live_url)
        core.setOutput('deployment_id', deployment_id)
        core.setOutput('duration_seconds', String(duration))
        core.setOutput('estimated_monthly_cost', String(env.estimated_monthly_cost))

        // Post status to GitHub commit
        await postCommitStatus(token, context, 'success', env.live_url)
        return
      }

      if (env.provisioning_status === 'failed') {
        await postCommitStatus(token, context, 'failure', '')
        core.setFailed(`Deployment failed at stage: ${env.die_stage}`)
        return
      }
    }

    core.setFailed(`Deployment timed out after ${timeoutMinutes} minutes`)
  } catch (err: any) {
    core.setFailed(err.message)
  }
}

async function postCommitStatus(
  token: string,
  context: typeof github.context,
  state: 'success' | 'failure' | 'pending',
  targetUrl: string
) {
  try {
    const octokit = github.getOctokit(
      process.env.GITHUB_TOKEN || token  // use GITHUB_TOKEN if available
    )
    await octokit.rest.repos.createCommitStatus({
      owner: context.repo.owner,
      repo: context.repo.repo,
      sha: context.sha,
      state,
      target_url: targetUrl,
      description: state === 'success' ? 'AutoStack deployment live' : 'AutoStack deployment failed',
      context: 'AutoStack / deploy'
    })
  } catch (err: any) {
    core.warning(`Failed to post commit status: ${err.message}`)
  }
}

run().catch(err => core.setFailed(err.message))
