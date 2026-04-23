// Client/Site API service

import { API_BASE_URL } from '../config'

// Auto-logout on 401 — clear token and redirect to login
const handleUnauthorized = (res: Response) => {
  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    window.location.href = '/login'
    return true
  }
  return false
}

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  })
  if (handleUnauthorized(res)) {
    throw new Error('Session expired — redirecting to login')
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json()
}

export interface Client {
  id: number
  name: string
  created_at: string
  updated_at: string
  sites: Site[]
}

export interface Site {
  id: number
  name: string
  client_id: number
  created_at: string
  updated_at: string
}

// Clients
export const getClients = () => api<Client[]>('/clients/')
export const createClient = (data: { name: string; site_name?: string }) => api<Client>('/clients/', {
  method: 'POST',
  body: JSON.stringify({ client: { name: data.name }, site: { name: data.site_name || '' } })
})

// Sites
export const getSites = (clientId: number) => api<Site[]>(`/sites/?client=${clientId}`)
export const createSite = (clientId: number, data: { name: string }) => api<Site>('/sites/', {
  method: 'POST',
  body: JSON.stringify({ site: { client: clientId, name: data.name } })
})

// Agents by client
export const getClientAgents = (clientId: number) => api(`/clients/${clientId}/agents/`)
