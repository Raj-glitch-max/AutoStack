'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Sidebar from '@/components/Sidebar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/store/authStore'
import { projectsApi, deployApi, type Project } from '@/lib/api'
import { Plus, Rocket } from 'lucide-react'

export default function ProjectsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deploying, setDeploying] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    repo_url: '',
    branch: 'main',
  })

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

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await projectsApi.create(formData.name, formData.repo_url, formData.branch)
      setShowModal(false)
      setFormData({ name: '', repo_url: '', branch: 'main' })
      fetchProjects()
    } catch (error) {
      console.error('Failed to create project:', error)
      alert('Failed to create project')
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
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-bold">Projects</h1>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Project
            </Button>
          </div>

          <Card>
            {projects.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No projects yet. Create one to get started!
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-4 font-medium">Name</th>
                      <th className="text-left p-4 font-medium">Repo URL</th>
                      <th className="text-left p-4 font-medium">Branch</th>
                      <th className="text-left p-4 font-medium">Status</th>
                      <th className="text-left p-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project, index) => (
                      <motion.tr
                        key={project.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border-b border-border hover:bg-card-hover transition-colors"
                      >
                        <td className="p-4 font-medium">{project.name}</td>
                        <td className="p-4 text-muted-foreground">
                          {project.repo_url}
                        </td>
                        <td className="p-4">{project.branch}</td>
                        <td className="p-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              project.status === 'deployed'
                                ? 'bg-green-500/20 text-green-400'
                                : project.status === 'building'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : project.status === 'pending'
                                ? 'bg-gray-500/20 text-gray-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {project.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <Button
                            size="sm"
                            onClick={() => handleDeploy(project.id)}
                            disabled={deploying === project.id}
                          >
                            <Rocket className="w-4 h-4 mr-2" />
                            {deploying === project.id ? 'Deploying...' : 'Deploy'}
                          </Button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-lg p-6 w-full max-w-md"
          >
            <h2 className="text-2xl font-bold mb-4">Add New Project</h2>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Repository URL
                </label>
                <Input
                  value={formData.repo_url}
                  onChange={(e) =>
                    setFormData({ ...formData, repo_url: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Branch</label>
                <Input
                  value={formData.branch}
                  onChange={(e) =>
                    setFormData({ ...formData, branch: e.target.value })
                  }
                  required
                />
              </div>
              <div className="flex gap-4">
                <Button type="submit" className="flex-1">
                  Create
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}

