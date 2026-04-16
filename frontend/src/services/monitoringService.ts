// Monitoring API service

import type {
  MonitoringProbe, MonitoringGroup, MonitoringSensor,
  MonitoringReading, MonitoringBackup, MonitoringDashboard,
} from '../types/monitoring'

const API = ''

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
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
export const getProbes = () => api<MonitoringProbe[]>('/v2/monitoring/probes/')
export const registerProbe = (data: Partial<MonitoringProbe>) => api<MonitoringProbe>('/v2/monitoring/probes/', { method: 'POST', body: JSON.stringify(data) })
export const deleteProbe = (id: number) => api<void>(`/monitoring/probes/${id}/`, { method: 'DELETE' })

// Groups
export const getGroups = () => api<MonitoringGroup[]>('/v2/monitoring/groups/')
export const createGroup = (data: Partial<MonitoringGroup>) => api<MonitoringGroup>('/v2/monitoring/groups/', { method: 'POST', body: JSON.stringify(data) })

// Sensors
export const getSensors = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return api<MonitoringSensor[]>(`/monitoring/sensors/${qs}`)
}
export const createSensor = (data: Partial<MonitoringSensor>) => api<MonitoringSensor>('/v2/monitoring/sensors/', { method: 'POST', body: JSON.stringify(data) })
export const updateSensor = (id: number, data: Partial<MonitoringSensor>) => api<MonitoringSensor>(`/monitoring/sensors/${id}/`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteSensor = (id: number) => api<void>(`/monitoring/sensors/${id}/`, { method: 'DELETE' })
export const pauseSensor = (id: number) => api<MonitoringSensor>(`/monitoring/sensors/${id}/pause/`, { method: 'POST' })
export const resumeSensor = (id: number) => api<MonitoringSensor>(`/monitoring/sensors/${id}/resume/`, { method: 'POST' })
export const getSensorHistory = (id: number, hours = 24) => api<MonitoringReading[]>(`/monitoring/sensors/${id}/history/?hours=${hours}`)

// Readings
export const submitReading = (data: { sensor_id: number; value_float?: number; value_text?: string; status: string }) =>
  api<MonitoringReading>('/v2/monitoring/readings/', { method: 'POST', body: JSON.stringify(data) })

// Dashboard
export const getMonitoringDashboard = () => api<MonitoringDashboard>('/v2/monitoring/dashboard/')

// Backups
export const getBackups = (sensorId: number) => api<MonitoringBackup[]>(`/monitoring/backups/${sensorId}/`)
export const getBackupDiff = (sensorId: number, fromId: number, toId: number) =>
  api<{ from: string; to: string }>(`/monitoring/backups/${sensorId}/diff/?from_id=${fromId}&to_id=${toId}`)

// Discovery
export interface DiscoverResult {
  alive: boolean
  latency_ms: number | null
  device_type: string | null
  sys_descr: string | null
  sys_name: string | null
  suggested_sensors: Array<{
    sensor_type: string
    display_name: string
    target_host: string
    description: string
    auto_create: boolean
  }>
}
export const discoverDevice = (target_host: string, snmp_community = 'public', snmp_version = '2c') =>
  api<DiscoverResult>('/v2/monitoring/discover/', { method: 'POST', body: JSON.stringify({ target_host, snmp_community, snmp_version }) })