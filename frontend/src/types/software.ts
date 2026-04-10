export interface SoftwarePackage {
  id: string
  name: string
  publisher: string
  version: string
  installedVersion?: string
  latestVersion?: string
  category: 'browser' | 'security' | 'productivity' | 'development' | 'media' | 'utility' | 'other'
  platform: 'windows' | 'linux' | 'macos'
  source: 'chocolatey' | 'winget' | 'brew' | 'apt' | 'manual'
  icon?: string
  description?: string
  size?: string
  releaseDate?: string
  vulnerabilities?: Vulnerability[]
  updateAvailable: boolean
  autoUpdate: boolean
}

export interface Vulnerability {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  cveId?: string
  description: string
  fixedInVersion?: string
}

export interface DeviceSoftware {
  deviceId: string
  software: SoftwarePackage[]
  lastScanTime: string
  scanStatus: 'idle' | 'scanning' | 'updating'
}

export interface ThirdPartyPatchPolicy {
  id: string
  name: string
  description: string
  enabled: boolean
  softwareCategories: string[]
  autoUpdate: boolean
  autoUpdateSeverity: ('critical' | 'high' | 'medium' | 'low')[]
  maintenanceWindow: {
    enabled: boolean
    days: string[]
    startTime: string
    endTime: string
  }
  excludePackages: string[]
  requireApproval: boolean
}

export interface SoftwareUpdateTask {
  id: string
  softwareId: string
  deviceId: string
  status: 'pending' | 'downloading' | 'installing' | 'completed' | 'failed' | 'rolled_back'
  fromVersion?: string
  toVersion: string
  startedAt: string
  completedAt?: string
  errorMessage?: string
  requiresReboot: boolean
}

export interface PatchSource {
  id: string
  name: string
  type: 'chocolatey' | 'winget' | 'brew' | 'apt'
  enabled: boolean
  lastSyncTime?: string
  status: 'active' | 'error' | 'disabled'
  errorMessage?: string
}
