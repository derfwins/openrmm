export type AutomationTriggerType = 'schedule' | 'alert' | 'event' | 'threshold'
export type AutomationActionType = 'reboot' | 'run_script' | 'patch' | 'send_email' | 'create_ticket'
export type AutomationStatus = 'active' | 'disabled' | 'draft'
export type AutomationRunStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export interface AutomationTask {
  id: string
  name: string
  description: string
  enabled: boolean
  status: AutomationStatus
  trigger: AutomationTrigger
  actions: AutomationActionStep[]
  targets: AutomationTargets
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  nextRunAt?: string
  runCount: number
}

export interface AutomationTrigger {
  type: AutomationTriggerType
  schedule?: AutomationSchedule
  alert?: AutomationAlertTrigger
  event?: AutomationEventTrigger
  threshold?: AutomationThresholdTrigger
}

export interface AutomationSchedule {
  cron: string
  timezone: string
  frequency?: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'
  label?: string
}

export interface AutomationAlertTrigger {
  alertType: string
  severity?: string
}

export interface AutomationEventTrigger {
  eventType: 'device_online' | 'device_offline' | 'patch_available' | 'software_installed' | 'alert_triggered'
  filters?: Record<string, string>
}

export interface AutomationThresholdTrigger {
  metric: string
  operator: '>' | '<' | '>=' | '<=' | '=='
  value: number
  duration: string
}

export interface AutomationActionStep {
  id: string
  type: AutomationActionType
  config: Record<string, unknown>
  continueOnError: boolean
  timeout?: number
}

export interface AutomationTargets {
  type: 'all' | 'group' | 'specific'
  groupIds?: string[]
  deviceIds?: string[]
}

export interface AutomationHistory {
  id: string
  taskId: string
  taskName: string
  startedAt: string
  completedAt?: string
  status: AutomationRunStatus
  actions: AutomationActionHistory[]
  error?: string
}

export interface AutomationActionHistory {
  actionType: AutomationActionType
  startedAt: string
  completedAt?: string
  status: AutomationRunStatus
  output?: string
  error?: string
}

// Keep backwards compat with old Automation type
export interface Automation {
  id: string
  name: string
  description: string
  trigger: AutomationTrigger
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  enabled: boolean
  createdAt: string
  lastRun?: string
  runCount: number
}

export interface AutomationCondition {
  type: 'device_type' | 'device_status' | 'device_platform' | 'custom_field'
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than'
  value: string | number
}

export interface AutomationAction {
  type: 'run_script' | 'send_email' | 'send_webhook' | 'reboot' | 'install_patch' | 'create_ticket'
  config: Record<string, any>
}

export interface AutomationRun {
  id: string
  automationId: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  result?: string
  error?: string
}