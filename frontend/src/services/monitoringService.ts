// Monitoring API service

import type {
  MonitoringProbe, MonitoringGroup, MonitoringSensor,
  MonitoringReading, MonitoringBackup, MonitoringDashboard,
} from '../types/monitoring'

const API = ''

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('openrmm_token')
  const res = await fetch(`${API}${path}`, {
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

// Probes
export const getProbes = () => api<MonitoringProbe[]>('/monitoring/probes/')
export const registerProbe = (data: Partial<MonitoringProbe>) => api<MonitoringProbe>('/monitoring/probes/', { method: 'POST', body: JSON.stringify(data) })
export const deleteProbe = (id: number) => api<void>(`/monitoring/probes/${id}/`, { method: 'DELETE' })

// Groups
export const getGroups = () => api<MonitoringGroup[]>('/monitoring/groups/')
export const createGroup = (data: Partial<MonitoringGroup>) => api<MonitoringGroup>('/monitoring/groups/', { method: 'POST', body: JSON.stringify(data) })

// Sensors
export const getSensors = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return api<MonitoringSensor[]>(`/monitoring/sensors/${qs}`)
}
export const createSensor = (data: Partial<MonitoringSensor>) => api<MonitoringSensor>('/monitoring/sensors/', { method: 'POST', body: JSON.stringify(data) })
export const updateSensor = (id: number, data: Partial<MonitoringSensor>) => api<MonitoringSensor>(`/monitoring/sensors/${id}/`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteSensor = (id: number) => api<void>(`/monitoring/sensors/${id}/`, { method: 'DELETE' })
export const pauseSensor = (id: number) => api<MonitoringSensor>(`/monitoring/sensors/${id}/pause/`, { method: 'POST' })
export const resumeSensor = (id: number) => api<MonitoringSensor>(`/monitoring/sensors/${id}/resume/`, { method: 'POST' })
export const getSensorHistory = (id: number, hours = 24) => api<MonitoringReading[]>(`/monitoring/sensors/${id}/history/?hours=${hours}`)

// Readings
export const submitReading = (data: { sensor_id: number; value_float?: number; value_text?: string; status: string }) =>
  api<MonitoringReading>('/monitoring/readings/', { method: 'POST', body: JSON.stringify(data) })

// Dashboard
export const getMonitoringDashboard = () => api<MonitoringDashboard>('/monitoring/dashboard/')

// Backups
export const getBackups = (sensorId: number) => api<MonitoringBackup[]>(`/monitoring/backups/${sensorId}/`)
export const getBackupDiff = (sensorId: number, fromId: number, toId: number) =>
  api<{ from: string; to: string }>(`/monitoring/backups/${sensorId}/diff/?from_id=${fromId}&to_id=${toId}`)