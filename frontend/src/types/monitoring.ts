// Monitoring system types

export type ProbeType = 'server' | 'client'
export type ProbeStatus = 'online' | 'offline'
export type SensorType = 'ping' | 'port' | 'http' | 'snmp_system' | 'snmp_interface' | 'snmp_cpu' | 'snmp_disk' | 'snmp_custom' | 'dns' | 'ssl_cert' | 'snmp_printer' | 'snmp_ups'
export type SensorStatus = 'ok' | 'warning' | 'critical' | 'unknown' | 'down'

export interface MonitoringProbe {
  id: number
  name: string
  probe_uuid: string
  site_id: number | null
  probe_type: ProbeType
  ip_address: string | null
  last_seen: string | null
  status: ProbeStatus
  version: string | null
  created_at: string
}

export interface MonitoringGroup {
  id: number
  name: string
  site_id: number | null
  parent_id: number | null
  icon: string | null
  sort_order: number
  children?: MonitoringGroup[]
  sensors?: MonitoringSensor[]
}

export interface MonitoringSensor {
  id: number
  display_name: string
  sensor_type: SensorType
  target_host: string
  target_port: number | null
  group_id: number | null
  probe_id: number | null
  snmp_version: string
  snmp_community: string
  interval_seconds: number
  timeout_seconds: number
  threshold_warning: number | null
  threshold_critical: number | null
  enabled: boolean
  paused: boolean
  last_check: string | null
  last_value_float: number | null
  last_value_text: string | null
  status: SensorStatus
  tags: string[] | null
  created_at: string
  probe?: MonitoringProbe
}

export interface MonitoringReading {
  id: number
  sensor_id: number
  timestamp: string
  value_float: number | null
  value_text: string | null
  status: SensorStatus
}

export interface MonitoringBackup {
  id: number
  sensor_id: number
  timestamp: string
  diff_from_last: string | null
  backup_type: string
  file_size: number | null
}

export interface MonitoringDashboard {
  total_sensors: number
  sensors_ok: number
  sensors_warning: number
  sensors_critical: number
  sensors_unknown: number
  sensors_down: number
  total_probes: number
  probes_online: number
  top_issues: Array<{
    sensor_id: number
    display_name: string
    status: SensorStatus
    last_value_text: string | null
  }>
}

export const SENSOR_TYPE_LABELS: Record<SensorType, string> = {
  ping: 'Ping',
  port: 'TCP Port',
  http: 'HTTP(S)',
  snmp_system: 'SNMP System',
  snmp_interface: 'SNMP Interface',
  snmp_cpu: 'SNMP CPU',
  snmp_disk: 'SNMP Disk',
  snmp_custom: 'SNMP Custom',
  dns: 'DNS',
  ssl_cert: 'SSL Certificate',
  snmp_printer: 'SNMP Printer',
  snmp_ups: 'SNMP UPS',
}

export const SENSOR_TYPE_ICONS: Record<SensorType, string> = {
  ping: '⏱',
  port: '🔌',
  http: '🌐',
  snmp_system: '🖥',
  snmp_interface: '📊',
  snmp_cpu: '⚡',
  snmp_disk: '💾',
  snmp_custom: '🔍',
  dns: '📝',
  ssl_cert: '🔒',
  snmp_printer: '🖨',
  snmp_ups: '🔋',
}

export const STATUS_COLORS: Record<SensorStatus, string> = {
  ok: '#10B981',
  warning: '#F59E0B',
  critical: '#EF4444',
  unknown: '#6B7280',
  down: '#991B1B',
}

export const STATUS_BG: Record<SensorStatus, string> = {
  ok: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
  warning: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
  critical: 'bg-red-500/20 border-red-500/30 text-red-400',
  unknown: 'bg-gray-500/20 border-gray-500/30 text-gray-400',
  down: 'bg-red-900/20 border-red-900/30 text-red-300',
}