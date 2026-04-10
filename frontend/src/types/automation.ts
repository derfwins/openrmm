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

export interface AutomationTrigger {
  type: 'schedule' | 'event' | 'webhook' | 'manual'
  schedule?: {
    frequency: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly'
    time?: string
    days?: string[]
    timezone: string
  }
  event?: {
    type: 'device_online' | 'device_offline' | 'alert_triggered' | 'patch_available'
  }
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
