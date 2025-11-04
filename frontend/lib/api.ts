import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to requests if available
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

export interface User {
  id: number
  email: string
  created_at: string
}

export interface Project {
  id: number
  user_id: number
  name: string
  repo_url: string
  branch: string
  status: string
  created_at: string
}

export interface Deployment {
  id: number
  project_id: number
  status: string
  log_output: string | null
  timestamp: string
}

export interface LogEntry {
  timestamp: string
  message: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
}

// Auth API
export const authApi = {
  signup: async (email: string, password: string): Promise<User> => {
    const response = await api.post('/auth/signup', { email, password })
    return response.data
  },

  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post('/auth/login', { email, password })
    return response.data
  },
}

// Projects API
export const projectsApi = {
  getAll: async (): Promise<Project[]> => {
    const response = await api.get('/projects')
    return response.data
  },

  create: async (name: string, repo_url: string, branch: string): Promise<Project> => {
    const response = await api.post('/projects', { name, repo_url, branch })
    return response.data
  },

  getById: async (id: number): Promise<Project> => {
    const response = await api.get(`/projects/${id}`)
    return response.data
  },
}

// Deploy API
export const deployApi = {
  trigger: async (projectId: number): Promise<Deployment> => {
    const response = await api.post(`/deploy/${projectId}`)
    return response.data
  },
}

// Logs API
export const logsApi = {
  getByProjectId: async (projectId: number): Promise<{ logs: LogEntry[] }> => {
    const response = await api.get(`/logs/${projectId}`)
    return response.data
  },
}

export default api

