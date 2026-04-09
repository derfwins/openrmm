// API Service for OpenRMM
// Connects to Tactical RMM Django backend

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Get auth token from localStorage
const getToken = () => localStorage.getItem('token')

export const apiService = {
  // Auth
  async login(username: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    
    if (!response.ok) throw new Error('Login failed')
    
    const data = await response.json()
    localStorage.setItem('token', data.access)
    localStorage.setItem('refresh', data.refresh)
    return data
  },

  async logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('refresh')
  },

  // Devices
  async getDevices() {
    const response = await fetch(`${API_BASE_URL}/api/v4/agents/`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })
    
    if (!response.ok) throw new Error('Failed to fetch devices')
    return response.json()
  },

  async getDevice(id: string) {
    const response = await fetch(`${API_BASE_URL}/api/v4/agents/${id}/`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })
    
    if (!response.ok) throw new Error('Failed to fetch device')
    return response.json()
  },

  // Scripts
  async getScripts() {
    const response = await fetch(`${API_BASE_URL}/api/v4/scripts/`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })
    
    if (!response.ok) throw new Error('Failed to fetch scripts')
    return response.json()
  },

  async runScript(agentId: string, scriptId: string) {
    const response = await fetch(`${API_BASE_URL}/api/v4/agents/${agentId}/runscript/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ script: scriptId }),
    })
    
    if (!response.ok) throw new Error('Failed to run script')
    return response.json()
  },

  // Alerts
  async getAlerts() {
    const response = await fetch(`${API_BASE_URL}/api/v4/alerts/`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })
    
    if (!response.ok) throw new Error('Failed to fetch alerts')
    return response.json()
  },

  // Remote commands
  async sendCommand(agentId: string, command: string, shell: string = 'powershell') {
    const response = await fetch(`${API_BASE_URL}/api/v4/agents/${agentId}/cmd/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ cmd: command, shell }),
    })
    
    if (!response.ok) throw new Error('Failed to send command')
    return response.json()
  },

  // System info
  async getSystemInfo(agentId: string) {
    const response = await fetch(`${API_BASE_URL}/api/v4/agents/${agentId}/sysinfo/`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    })
    
    if (!response.ok) throw new Error('Failed to fetch system info')
    return response.json()
  },
}

export default apiService
