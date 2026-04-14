import { API_BASE_URL } from '../config'

// Get auth token from localStorage
const getToken = () => localStorage.getItem('token')

// Auth header — JWT Bearer token (OpenRMM custom backend)
const authHeaders = (): Record<string, string> => {
  const token = getToken()
  return token
    ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
}

export const apiService = {
  // Auth - Two-step login: check creds first, then login with or without 2FA
  async checkCredentials(username: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/v2/checkcreds/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    
    if (!response.ok) throw new Error('Invalid credentials')
    return response.json()
  },

  async login(username: string, password: string, twofactor?: string) {
    const body: Record<string, string> = { username, password }
    if (twofactor) body.twofactor = twofactor
    const response = await fetch(`${API_BASE_URL}/v2/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    if (!response.ok) throw new Error('Login failed')
    
    const data = await response.json()
    localStorage.setItem('token', data.token)
    return data
  },

  // Devices / Agents
  async getDevices() {
    const response = await fetch(`${API_BASE_URL}/agents/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch devices')
    return response.json()
  },

  async getDevice(id: string) {
    const response = await fetch(`${API_BASE_URL}/agents/${id}/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch device')
    return response.json()
  },

  // Scripts
  async getScripts() {
    const response = await fetch(`${API_BASE_URL}/scripts/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch scripts')
    return response.json()
  },

  async runScript(agentId: string, scriptId: string) {
    const response = await fetch(`${API_BASE_URL}/agents/${agentId}/runscript/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ script: scriptId }),
    })
    if (!response.ok) throw new Error('Failed to run script')
    return response.json()
  },

  // Alerts
  async getAlerts() {
    const response = await fetch(`${API_BASE_URL}/alerts/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch alerts')
    return response.json()
  },

  // Remote commands
  async sendCommand(agentId: string, command: string, shell: string = 'powershell') {
    const response = await fetch(`${API_BASE_URL}/agents/${agentId}/cmd/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ cmd: command, shell }),
    })
    if (!response.ok) throw new Error('Failed to send command')
    return response.json()
  },

  // System info
  async getSystemInfo(agentId: string) {
    const response = await fetch(`${API_BASE_URL}/agents/${agentId}/sysinfo/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch system info')
    return response.json()
  },

  // Clients / Sites hierarchy
  async getClients() {
    const response = await fetch(`${API_BASE_URL}/clients/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch clients')
    return response.json()
  },

  async getSites() {
    const response = await fetch(`${API_BASE_URL}/clients/sites/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch sites')
    return response.json()
  },

  // Checks
  async getChecks(agentId: string) {
    const response = await fetch(`${API_BASE_URL}/checks/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch checks')
    return response.json()
  },

  // Core settings
  async getSettings() {
    const response = await fetch(`${API_BASE_URL}/core/settings/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch settings')
    return response.json()
  },

  // Windows Updates
  async getUpdates(agentId: string) {
    const response = await fetch(`${API_BASE_URL}/winupdate/${agentId}/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch updates')
    return response.json()
  },

  // Software
  async getSoftware(agentId: string) {
    const response = await fetch(`${API_BASE_URL}/software/${agentId}/`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Failed to fetch software')
    return response.json()
  },
}

export default apiService