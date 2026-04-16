// Client/ Site API service

import { API_BASE_URL } from '../config'

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
export const createClient = (data: { name: string }) => api<Client>('/clients/', { method: 'POST', body: JSON.stringify(data) })

// Sites
export const getSites = (clientId: number) => api<Site[]>(`/clients/${clientId}/sites/`)
export const createSite = (clientId: number, data: { name: string }) => api<Site>(`/clients/${clientId}/sites/`, { method: 'POST', body: JSON.stringify(data) })

// Agents by client
export const getClientAgents = (clientId: number) => api(`/clients/${clientId}/agents/`)