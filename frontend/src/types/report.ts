export const ReportType = {
  SystemHealth: 'system_health',
  PatchCompliance: 'patch_compliance',
  AuditLog: 'audit_log',
  DeviceInventory: 'device_inventory',
  AgentActivity: 'agent_activity',
} as const

export type ReportType = (typeof ReportType)[keyof typeof ReportType]

export interface ReportDateRange {
  start: string
  end: string
}

export interface ReportFilters {
  client?: string
  site?: string
  status?: string
  severity?: string
}

export interface Report {
  id: string
  type: ReportType
  date_range: ReportDateRange
  filters: ReportFilters
  format: 'pdf' | 'csv'
  status: 'pending' | 'generating' | 'completed' | 'failed'
  generated_at?: string
  file_url?: string
  created_at: string
}

export interface ReportSchedule {
  id: string
  type: ReportType
  date_range: ReportDateRange
  filters: ReportFilters
  format: 'pdf' | 'csv'
  frequency: 'daily' | 'weekly' | 'monthly'
  enabled: boolean
  last_run?: string
  next_run?: string
  created_at: string
}