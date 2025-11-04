'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Sidebar from '@/components/Sidebar'
import Card from '@/components/ui/Card'
import { useAuthStore } from '@/store/authStore'
import { projectsApi, type Project } from '@/lib/api'
import { FolderKanban, Rocket, Clock, CheckCircle2 } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

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

  const activeProjects = projects.filter(
    (p) => p.status === 'deployed' || p.status === 'building'
  ).length

  const lastDeployment = projects.length > 0
    ? projects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null

  const pendingJobs = projects.filter((p) => p.status === 'pending').length

  const stats = [
    {
      label: 'Active Projects',
      value: activeProjects,
      icon: FolderKanban,
      color: 'text-accent',
    },
    {
      label: 'Last Deployment',
      value: lastDeployment?.name || 'None',
      icon: Rocket,
      color: 'text-blue-400',
    },
    {
      label: 'Pending Jobs',
      value: pendingJobs,
      icon: Clock,
      color: 'text-yellow-400',
    },
    {
      label: 'Total Projects',
      value: projects.length,
      icon: CheckCircle2,
      color: 'text-green-400',
    },
  ]

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
          <h1 className="text-4xl font-bold mb-8">Dashboard</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, index) => {
              const Icon = stat.icon
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="hover:border-accent transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {stat.label}
                        </p>
                        <p className="text-2xl font-bold">
                          {typeof stat.value === 'number' ? stat.value : stat.value}
                        </p>
                      </div>
                      <Icon className={`w-8 h-8 ${stat.color}`} />
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </div>

          <Card>
            <h2 className="text-2xl font-bold mb-4">Recent Projects</h2>
            {projects.length === 0 ? (
              <p className="text-muted-foreground">No projects yet. Create one to get started!</p>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 5).map((project) => (
                  <motion.div
                    key={project.id}
                    whileHover={{ x: 4 }}
                    className="flex items-center justify-between p-4 rounded-lg bg-card-hover border border-border"
                  >
                    <div>
                      <p className="font-medium">{project.name}</p>
                      <p className="text-sm text-muted-foreground">{project.repo_url}</p>
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
                  </motion.div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

