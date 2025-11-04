'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Sidebar from '@/components/Sidebar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/store/authStore'

export default function SettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [settings, setSettings] = useState({
    jenkinsUrl: '',
    githubToken: '',
    awsRegion: '',
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
  }, [isAuthenticated, router])

  const handleSave = () => {
    // In a real app, this would save to backend
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!isAuthenticated) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto"
        >
          <h1 className="text-4xl font-bold mb-8">Settings</h1>

          <Card>
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Jenkins URL
                </label>
                <Input
                  type="url"
                  placeholder="https://jenkins.example.com"
                  value={settings.jenkinsUrl}
                  onChange={(e) =>
                    setSettings({ ...settings, jenkinsUrl: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  GitHub Token
                </label>
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={settings.githubToken}
                  onChange={(e) =>
                    setSettings({ ...settings, githubToken: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  AWS Region
                </label>
                <Input
                  type="text"
                  placeholder="us-east-1"
                  value={settings.awsRegion}
                  onChange={(e) =>
                    setSettings({ ...settings, awsRegion: e.target.value })
                  }
                />
              </div>

              <div className="flex items-center gap-4">
                <Button type="submit">Save Settings</Button>
                {saved && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-green-400"
                  >
                    Settings saved!
                  </motion.span>
                )}
              </div>
            </form>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

