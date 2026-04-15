export type PatchSeverity = 'critical' | 'important' | 'moderate' | 'low'
export type PatchSource = 'chocolatey' | 'winget' | 'brew' | 'apt'
export type PatchCategory = 'security' | 'feature' | 'bugfix' | 'driver'
export type PatchApprovalStatus = 'pending' | 'approved' | 'denied'

export interface PatchApproval {
  id: string
  patchId: string
  deviceId: string
  status: PatchApprovalStatus
  approvedBy?: string
  approvedAt?: string
  deniedReason?: string
  createdAt: string
}

export interface PackageVulnerability {
  id: string
  cveId?: string
  severity: PatchSeverity
  description: string
  fixedInVersion?: string
  publishedAt?: string
  cvssScore?: number
}

export interface PatchPolicy {
  id: string
  name: string
  description: string
  enabled: boolean
  schedule: PatchPolicySchedule
  targets: PatchPolicyTargets
  approvalRules: PatchApprovalRules
  blackoutWindows: PatchBlackoutWindow[]
  rebootBehavior: 'automatic' | 'prompt' | 'never'
  createdAt: string
  updatedAt: string
}

export interface PatchPolicySchedule {
  frequency: 'daily' | 'weekly' | 'monthly'
  dayOfWeek?: number // 0-6 for weekly
  dayOfMonth?: number // 1-31 for monthly
  time: string // HH:mm
  timezone: string
}

export interface PatchPolicyTargets {
  type: 'all' | 'group' | 'specific'
  groupIds?: string[]
  deviceIds?: string[]
  platforms?: ('windows' | 'linux' | 'macos')[]
}

export interface PatchApprovalRules {
  autoApproveSeverity: PatchSeverity[]
  requireApprovalAbove: PatchSeverity
  deadlineDays: number
  denyExpiredAfterDays?: number
}

export interface PatchBlackoutWindow {
  id: string
  name: string
  daysOfWeek: number[] // 0-6
  startTime: string
  endTime: string
  timezone: string
}