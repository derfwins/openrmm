export interface Device {
  id: string
  name: string
  status: DeviceStatus
  type: 'workstation' | 'server' | 'laptop' | 'device'
  platform: 'windows' | 'macos' | 'linux'
  last_seen: string
  cpu_usage: number
  memory_usage: number
  disk_usage: number
  ip: string
  site: string
  client: string
}

export type DeviceStatus = 'online' | 'offline' | 'warning' | 'error'

export interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  device_id: string
  created_at: string
  acknowledged: boolean
}

export interface Script {
  id: string
  name: string
  description: string
  shell: 'powershell' | 'bash' | 'python'
  code: string
  timeout: number
}

export interface Automation {
  id: string
  name: string
  trigger: 'schedule' | 'event' | 'manual'
  conditions: string[]
  actions: string[]
  enabled: boolean
}
