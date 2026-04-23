import type {
  AutomationTask,
  AutomationHistory,
  AutomationSchedule,
} from '../types/automation'

// Auto-logout on 401
const handleUnauthorized = (res: Response) => {
  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    window.location.href = '/login'
    return true
  }
  return false
}

const BASE = '/automations'

export const automationService = {
  async list(): Promise<AutomationTask[]> {
    try {
      const resp = await fetch(`${BASE}/`, { headers: this._headers() })
      if (handleUnauthorized(resp)) throw new Error('Session expired')
      if (!resp.ok) throw new Error('Failed to list automations')
      return resp.json()
    } catch {
      return []
    }
  },

  async get(id: string): Promise<AutomationTask | null> {
    try {
      const resp = await fetch(`${BASE}/${id}/`, { headers: this._headers() })
      if (handleUnauthorized(resp)) throw new Error('Session expired')
      if (!resp.ok) return null
      return resp.json()
    } catch {
      return null
    }
  },

  async create(task: Omit<AutomationTask, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>): Promise<AutomationTask> {
    const now = new Date().toISOString()
    const newTask: AutomationTask = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    }
    return newTask
  },

  async update(id: string, updates: Partial<AutomationTask>): Promise<AutomationTask> {
    return { ...updates, id, updatedAt: new Date().toISOString() } as AutomationTask
  },

  async delete(_id: string): Promise<void> {
    // Will call API when endpoint exists
  },

  async execute(id: string): Promise<AutomationHistory> {
    return {
      id: crypto.randomUUID(),
      taskId: id,
      taskName: '',
      startedAt: new Date().toISOString(),
      status: 'running',
      actions: [],
    }
  },

  async test(id: string): Promise<AutomationHistory> {
    return {
      id: crypto.randomUUID(),
      taskId: id,
      taskName: '',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      actions: [],
    }
  },

  async getHistory(_taskId?: string): Promise<AutomationHistory[]> {
    return []
  },

  async toggleEnabled(id: string, enabled: boolean): Promise<AutomationTask> {
    return this.update(id, { enabled })
  },

  buildCronExpression(schedule: AutomationSchedule): string {
    if (schedule.frequency === 'custom' && schedule.cron) return schedule.cron
    switch (schedule.frequency) {
      case 'hourly': return '0 * * * *'
      case 'daily': return `0 ${schedule.cron?.split(' ')[1] || '0'} * * *`
      case 'weekly': return '0 0 * * 1'
      case 'monthly': return '0 0 1 * *'
      default: return schedule.cron || '0 0 * * *'
    }
  },

  _headers(): Record<string, string> {
    const token = localStorage.getItem('token')
    return token
      ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' }
  },
}

export default automationService