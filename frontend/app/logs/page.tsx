'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Sidebar from '@/components/Sidebar'
import Card from '@/components/ui/Card'
import { useAuthStore } from '@/store/authStore'
import { projectsApi, logsApi, type Project, type LogEntry } from '@/lib/api'

export default function LogsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<number | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    fetchProjects()
  }, [isAuthenticated, router])

  useEffect(() => {
    if (selectedProject) {
      fetchLogs(selectedProject)
      const interval = setInterval(() => {
        fetchLogs(selectedProject)
      }, 2000) // Poll every 2 seconds

      return () => clearInterval(interval)
    }
  }, [selectedProject])

  const fetchProjects = async () => {
    try {
      const data = await projectsApi.getAll()
      setProjects(data)
      if (data.length > 0 && !selectedProject) {
        setSelectedProject(data[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async (projectId: number) => {
    try {
      const response = await logsApi.getByProjectId(projectId)
      setLogs(response.logs)
    } catch (error) {
      console.error('Failed to fetch logs:', error)
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
            <h1 className="text-4xl font-bold">Logs</h1>
            {projects.length > 0 && (
              <select
                value={selectedProject || ''}
                onChange={(e) => setSelectedProject(Number(e.target.value))}
                className="bg-card border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <Card>
            {selectedProject ? (
              <div className="h-[600px] overflow-y-auto font-mono text-sm">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">No logs available yet.</p>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-4"
                      >
                        <span className="text-muted-foreground text-xs">
                          {log.timestamp}
                        </span>
                        <span className="text-foreground">{log.message}</span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No projects available. Create a project first!
              </p>
            )}
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

