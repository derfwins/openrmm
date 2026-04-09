export interface Patch {
  id: string
  name: string
  description: string
  severity: 'critical' | 'important' | 'moderate' | 'low'
  category: 'security' | 'feature' | 'bugfix' | 'driver'
  platform: 'windows' | 'linux' | 'macos'
  version: string
  releaseDate: string
  rebootRequired: boolean
  downloadUrl?: string
  size?: string
}

export interface DevicePatch {
  patchId: string
  deviceId: string
  status: 'available' | 'downloading' | 'pending' | 'installing' | 'installed' | 'failed'
  installedAt?: string
  errorMessage?: string
}

export interface PatchPolicy {
  id: string
  name: string
  description: string
  autoApproveSeverity: string[]
  autoInstallTime: string
  rebootBehavior: 'automatic' | 'prompt' | 'never'
  maintenanceWindow: {
    enabled: boolean
    days: string[]
    startTime: string
    endTime: string
  }
}

export interface PatchScanResult {
  deviceId: string
  scanTime: string
  totalPatches: number
  criticalCount: number
  importantCount: number
  moderateCount: number
  lowCount: number
  patches: DevicePatch[]
}
