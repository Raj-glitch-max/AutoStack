'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Sidebar from '@/components/Sidebar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/store/authStore'
import { projectsApi, deployApi, type Project } from '@/lib/api'
import { Rocket } from 'lucide-react'

export default function DeployPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState<number | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    fetchProjects()
  }, [isAuthenticated, router])

  const fetchProjects = async () => {
    try {
      const data = await projectsApi.getAll()
      setProjects(data)
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeploy = async (projectId: number) => {
    setDeploying(projectId)
    try {
      await deployApi.trigger(projectId)
      alert('Deployment started! Check the Logs page for progress.')
      fetchProjects()
    } catch (error) {
      console.error('Failed to deploy:', error)
      alert('Failed to start deployment')
    } finally {
      setDeploying(null)
    }
  }

  if (!isAuthenticated) {
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto"
        >
          <h1 className="text-4xl font-bold mb-8">Deploy</h1>

          {projects.length === 0 ? (
            <Card>
              <p className="text-muted-foreground text-center py-8">
                No projects available. Create a project first!
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="hover:border-accent transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold mb-2">{project.name}</h3>
                        <p className="text-sm text-muted-foreground mb-1">
                          {project.repo_url}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Branch: {project.branch}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          project.status === 'deployed'
                            ? 'bg-green-500/20 text-green-400'
                            : project.status === 'building'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {project.status}
                      </span>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => handleDeploy(project.id)}
                      disabled={deploying === project.id}
                    >
                      <Rocket className="w-4 h-4 mr-2" />
                      {deploying === project.id ? 'Deploying...' : 'Deploy'}
                    </Button>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  )
}

