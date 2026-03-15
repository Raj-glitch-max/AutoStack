import * as core from '@actions/core'
import * as github from '@actions/github'

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    const environment = core.getInput('environment', { required: true })
    const toCommit = core.getInput('to') || undefined

    const apiBase = process.env.AUTOSTACK_API_URL || 'https://api.autostack.io'
    const context = github.context

    core.info(`🔄 AutoStack: rolling back ${environment}${toCommit ? ` to ${toCommit.slice(0, 7)}` : ''}`)

    // POST to AutoStack API: trigger rollback
    const response = await fetch(`${apiBase}/functions/v1/deploy-rollback`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        environment,
        to_commit: toCommit,
        triggered_by: 'github_actions'
      })
    })

    if (!response.ok) {
      const err = await response.json()
      core.setFailed(`AutoStack rollback failed: ${err.error || response.statusText}`)
      return
    }

    const { deployment_id, rolled_back_to, previous_deployment_id } = await response.json()
    
    core.info(`✅ Rollback initiated`)
    core.info(`📋 Rolled back to: ${rolled_back_to}`)
    core.info(`🔖 Previous deployment ID: ${previous_deployment_id}`)

    // Set outputs
    core.setOutput('rolled_back_to', rolled_back_to)
    core.setOutput('previous_deployment_id', previous_deployment_id)

    // Post status to GitHub commit
    try {
      const octokit = github.getOctokit(process.env.GITHUB_TOKEN || token)
      await octokit.rest.repos.createCommitStatus({
        owner: context.repo.owner,
        repo: context.repo.repo,
        sha: context.sha,
        state: 'success',
        description: `Rolled back to ${rolled_back_to.slice(0, 7)}`,
        context: 'AutoStack / rollback'
      })
    } catch (err: any) {
      core.warning(`Failed to post commit status: ${err.message}`)
    }

  } catch (err: any) {
    core.setFailed(err.message)
  }
}

run().catch(err => core.setFailed(err.message))
