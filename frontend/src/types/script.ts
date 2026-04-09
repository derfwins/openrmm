export interface Script {
  id: string
  name: string
  description: string
  language: 'powershell' | 'bash' | 'python' | 'batch'
  content: string
  category: string
  author: string
  createdAt: string
  parameters?: ScriptParameter[]
}

export interface ScriptParameter {
  name: string
  description: string
  type: 'string' | 'number' | 'boolean'
  required: boolean
  defaultValue?: string
}

export interface ScriptExecution {
  id: string
  scriptId: string
  deviceId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  output?: string
  error?: string
}
