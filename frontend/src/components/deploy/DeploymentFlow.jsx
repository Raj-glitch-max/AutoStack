import { useState, useEffect } from 'react'
import { Loader2, Check, AlertCircle, Sparkles } from 'lucide-react'
import { CostEstimateCard } from './CostEstimateCard'
import { supabase } from '../../lib/supabase'

export function DeploymentFlow({ repoUrl, onComplete, onCancel }) {
  const [phase, setPhase] = useState('analyzing') // analyzing | options | deploying | complete
  const [analysisData, setAnalysisData] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [error, setError] = useState(null)
  const [deploymentId, setDeploymentId] = useState(null)
  const [deploymentLogs, setDeploymentLogs] = useState([])
  const [currentStage, setCurrentStage] = useState(null)

  // Start analysis when component mounts
  useEffect(() => {
    if (repoUrl && phase === 'analyzing') {
      startAnalysis()
    }
  }, [repoUrl])

  // Poll for deployment logs
  useEffect(() => {
    if (deploymentId && phase === 'deploying') {
      const interval = setInterval(async () => {
        await fetchDeploymentStatus()
      }, 2000) // Poll every 2 seconds

      return () => clearInterval(interval)
    }
  }, [deploymentId, phase])

  async function startAnalysis() {
    try {
      // Call die-analyze function
      const { data, error: analyzeError } = await supabase.functions.invoke('die-analyze', {
        body: {
          github_repo_url: repoUrl,
          branch: 'main',
          org_id: '00000000-0000-0000-0000-000000000001' // TODO: Get from auth
        }
      })

      if (analyzeError) throw analyzeError

      setAnalysisData(data)
      setPhase('options')
    } catch (err) {
      console.error('Analysis error:', err)
      setError(err.message || 'Failed to analyze repository')
    }
  }

  async function startDeployment() {
    try {
      setPhase('deploying')

      // Call setup-build-pipeline function
      const { data, error: deployError } = await supabase.functions.invoke('setup-build-pipeline', {
        body: {
          deployment_id: analysisData.deployment_id,
          org_id: '00000000-0000-0000-0000-000000000001',
          classification: analysisData.classification,
          dockerfile_content: analysisData.dockerfile,
          github_repo_url: repoUrl,
          branch: 'main'
        }
      })

      if (deployError) throw deployError

      setDeploymentId(analysisData.deployment_id)

      // Start build
      await supabase.functions.invoke('run-build', {
        body: {
          deployment_id: analysisData.deployment_id,
          branch: 'main'
        }
      })

    } catch (err) {
      console.error('Deployment error:', err)
      setError(err.message || 'Failed to start deployment')
    }
  }

  async function fetchDeploymentStatus() {
    try {
      // Get deployment status
      const { data: deployment } = await supabase
        .from('deployments')
        .select('current_stage, status, live_url')
        .eq('id', deploymentId)
        .single()

      if (deployment) {
        setCurrentStage(deployment.current_stage)

        // Check if deployment is complete
        if (deployment.current_stage === 'active' && deployment.live_url) {
          setPhase('complete')
          onComplete({ liveUrl: deployment.live_url })
        }

        if (deployment.current_stage === 'failed') {
          setError('Deployment failed. Check logs for details.')
        }
      }

      // Get logs
      const { data: logs } = await supabase
        .from('build_log_entries')
        .select('*')
        .eq('deployment_id', deploymentId)
        .order('timestamp', { ascending: true })

      if (logs) {
        setDeploymentLogs(logs)
      }
    } catch (err) {
      console.error('Status fetch error:', err)
    }
  }

  // Phase: Analyzing (10-15 seconds)
  if (phase === 'analyzing') {
    const steps = [
      { label: 'Fetching repository files', status: 'done' },
      { label: 'Detecting language and framework', status: analysisData ? 'done' : 'running' },
      { label: 'Analyzing dependencies', status: analysisData ? 'done' : 'pending' },
      { label: 'Calculating resource requirements', status: analysisData ? 'done' : 'pending' },
      { label: 'Selecting optimal AWS service', status: analysisData ? 'done' : 'pending' },
    ]

    return (
      <div className="animate-fadeUp max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#2463eb]/10 border border-[#2463eb]/20 mb-4">
            <Loader2 className="w-4 h-4 animate-spin text-[#2463eb]" />
            <span className="text-sm font-medium text-[#2463eb]">Analyzing repository...</span>
          </div>
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-2">
            Detecting your stack
          </h2>
          <p className="text-sm text-[#7A8099]">
            AutoStack is analyzing your code to determine the optimal infrastructure
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-4 rounded-xl border bg-[#0d1117]"
              style={{
                borderColor: step.status === 'running' ? '#2463eb' : '#1C2235',
              }}
            >
              {step.status === 'done' ? (
                <Check className="w-5 h-5 text-[#22c55e]" />
              ) : step.status === 'running' ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#2463eb]" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-[#334366]" />
              )}
              <span
                className="text-sm font-medium"
                style={{
                  color: step.status === 'pending' ? '#7A8099' : '#f1f5f9',
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-xl bg-[#111520] border border-[#1C2235]">
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-[#a78bfa] mt-0.5 shrink-0" />
            <div className="text-xs text-[#7A8099] leading-relaxed">
              <span className="text-[#f1f5f9] font-medium">Smart detection:</span> AutoStack
              automatically detects your build commands, runtime version, health check paths,
              and infrastructure requirements. No configuration needed.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Phase: Cost Options (user selection)
  if (phase === 'options' && analysisData) {
    return (
      <div className="animate-fadeUp max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 mb-4">
            <Check className="w-4 h-4 text-[#22c55e]" />
            <span className="text-sm font-medium text-[#22c55e]">Analysis complete</span>
          </div>
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-2">
            {analysisData.classification.framework} detected
          </h2>
          <p className="text-sm text-[#7A8099]">
            Select your preferred infrastructure option
          </p>
        </div>

        {/* Detection summary */}
        <div className="mb-8 p-6 rounded-xl bg-[#0d1117] border border-[#1C2235]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-[#7A8099] mb-1">Language</div>
              <div className="text-sm font-medium text-[#f1f5f9]">
                {analysisData.classification.language}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#7A8099] mb-1">Framework</div>
              <div className="text-sm font-medium text-[#f1f5f9]">
                {analysisData.classification.framework}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#7A8099] mb-1">App Type</div>
              <div className="text-sm font-medium text-[#f1f5f9] capitalize">
                {analysisData.classification.appType.replace('-', ' ')}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#7A8099] mb-1">Analysis Time</div>
              <div className="text-sm font-medium text-[#f1f5f9]">
                {(analysisData.analysis_duration_ms / 1000).toFixed(1)}s
              </div>
            </div>
          </div>
        </div>

        {/* Cost options */}
        {analysisData.infrastructure_options && (
          <CostEstimateCard
            options={analysisData.infrastructure_options.options}
            selectedOption={selectedOption}
            onSelect={setSelectedOption}
            className="mb-8"
          />
        )}

        {/* Action buttons */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-lg border border-[#334366] text-[#f1f5f9] text-sm font-medium hover:bg-[#111520] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selectedOption) {
                startDeployment()
              }
            }}
            disabled={!selectedOption}
            className="px-6 py-3 rounded-lg bg-[#2463eb] text-white text-sm font-medium hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Deploy with {selectedOption?.label || 'selected option'}
            <span className="text-xs opacity-75">
              ({selectedOption?.cost.displayPrice})
            </span>
          </button>
        </div>
      </div>
    )
  }

  // Phase: Deploying (actual provisioning)
  if (phase === 'deploying') {
    // Map deployment stages to UI steps
    const stageSteps = {
      'provisioning_infra': 0,
      'building_image': 1,
      'pushing_image': 2,
      'deploying': 3,
      'health_checking': 4,
      'active': 5
    }

    const currentStepIndex = stageSteps[currentStage] || 0

    const steps = [
      { label: 'Creating ECR repository and IAM roles', stage: 'provisioning_infra' },
      { label: 'Building Docker image', stage: 'building_image' },
      { label: 'Pushing image to ECR', stage: 'pushing_image' },
      { label: 'Deploying to App Runner', stage: 'deploying' },
      { label: 'Running health checks', stage: 'health_checking' },
      { label: 'Application ready', stage: 'active' },
    ].map((step, i) => ({
      ...step,
      status: i < currentStepIndex ? 'done' : i === currentStepIndex ? 'running' : 'pending'
    }))

    return (
      <div className="animate-fadeUp max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#2463eb]/10 border border-[#2463eb]/20 mb-4">
            <Loader2 className="w-4 h-4 animate-spin text-[#2463eb]" />
            <span className="text-sm font-medium text-[#2463eb]">Deploying to AWS...</span>
          </div>
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-2">
            Building and deploying
          </h2>
          <p className="text-sm text-[#7A8099]">
            This will take approximately 7-10 minutes
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-4 rounded-xl border bg-[#0d1117]"
              style={{
                borderColor: step.status === 'running' ? '#2463eb' : '#1C2235',
              }}
            >
              {step.status === 'done' ? (
                <Check className="w-5 h-5 text-[#22c55e]" />
              ) : step.status === 'running' ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#2463eb]" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-[#334366]" />
              )}
              <span
                className="text-sm font-medium"
                style={{
                  color: step.status === 'pending' ? '#7A8099' : '#f1f5f9',
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Real-time logs */}
        {deploymentLogs.length > 0 && (
          <div className="p-4 rounded-xl bg-[#0d1117] border border-[#1C2235] max-h-64 overflow-y-auto">
            <div className="text-xs font-mono space-y-1">
              {deploymentLogs.slice(-10).map((log, i) => (
                <div
                  key={i}
                  className={`${
                    log.level === 'error' ? 'text-[#ef4444]' :
                    log.level === 'success' ? 'text-[#22c55e]' :
                    log.level === 'warn' ? 'text-[#f59e0b]' :
                    'text-[#7A8099]'
                  }`}
                >
                  {log.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="animate-fadeUp max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#ef4444]/10 border border-[#ef4444]/20 mb-4">
            <AlertCircle className="w-4 h-4 text-[#ef4444]" />
            <span className="text-sm font-medium text-[#ef4444]">Analysis failed</span>
          </div>
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-2">Something went wrong</h2>
          <p className="text-sm text-[#7A8099]">{error}</p>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-lg border border-[#334366] text-[#f1f5f9] text-sm font-medium hover:bg-[#111520] transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  return null
}
