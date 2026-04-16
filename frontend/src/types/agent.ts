export interface AgentInfo {
  id: string
  hostname: string
  agent_id: string
  site_id: number | null
  version: string
  plat: string // windows, linux, darwin
  goarch: string // amd64, arm64
  status: 'online' | 'offline' | 'overdue' | 'error'
  last_seen: string | null
  first_seen: string
  monitoring_type: 'server' | 'workstation'
  description: string
  remote_desktop_id: string
  is_maintenance: boolean
  cpu_model: string
  cpu_cores: number
  total_ram: number
  os_name: string
  os_version: string
  public_ip: string
  local_ip: string
  logged_in_user: string
}

export interface AgentCommand {
  id: string
  agent_id: string
  command: string
  shell: 'powershell' | 'bash' | 'python'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout'
  output: string
  created_at: string
  completed_at: string | null
  run_by: string
  timeout: number
}

export interface AgentHeartbeat {
  agent_id: string
  hostname: string
  version: string
  operating_system: string
  plat: string
  goarch: string
  cpu_model: string
  cpu_cores: number
  total_ram: number
  os_name: string
  os_version: string
  public_ip: string
  local_ip: string
  logged_in_user: string
}

export interface AgentEnrollment {
  hostname: string
  platform: string
  goarch: string
  agent_type: string
  client: string
  site: string
}

export interface AgentService {
  name: string
  display_name: string
  status: 'running' | 'stopped' | 'paused'
  start_type: 'auto' | 'manual' | 'disabled'
}