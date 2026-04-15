import type { PatchSource } from '../types/patchPolicy'
import type { PatchPolicy } from '../types/patchPolicy'
import type { Patch } from '../types/patch'
import apiService from './apiService'

// ─── Chocolatey API ───────────────────────────────────────────────

const CHOCO_API = 'https://community.chocolatey.org/api/v2'

export interface ChocolateyPackage {
  title: string
  id: string
  version: string
  downloadCount: number
}

export const chocolateyService = {
  async searchPackages(query: string) {
    const resp = await fetch(`${CHOCO_API}/Search()?searchTerm='${encodeURIComponent(query)}'&$top=20&$orderby=DownloadCount desc`)
    if (!resp.ok) throw new Error('Chocolatey search failed')
    const text = await resp.text()
    const entries: ChocolateyPackage[] = []
    const entryRegex = /<entry>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<m:properties>[\s\S]*?<d:Id>(.*?)<\/d:Id>[\s\S]*?<d:Version>(.*?)<\/d:Version>[\s\S]*?<d:DownloadCount>(.*?)<\/d:DownloadCount>[\s\S]*?<\/m:properties>/g
    let match
    while ((match = entryRegex.exec(text)) !== null) {
      entries.push({ title: match[1], id: match[2], version: match[3], downloadCount: parseInt(match[4]) || 0 })
    }
    return entries
  },

  async getPackageDetails(packageId: string) {
    const resp = await fetch(`${CHOCO_API}/Packages()?$filter=Id eq '${packageId}'&$top=1`)
    if (!resp.ok) throw new Error('Failed to get package details')
    return resp.text()
  },

  async installPackage(agentId: string, packageId: string, version?: string) {
    const cmd = version
      ? `choco install ${packageId} --version=${version} -y`
      : `choco install ${packageId} -y`
    return apiService.sendCommand(agentId, cmd, 'powershell')
  },

  async updatePackage(agentId: string, packageId: string) {
    return apiService.sendCommand(agentId, `choco upgrade ${packageId} -y`, 'powershell')
  },

  async listInstalled(agentId: string) {
    return apiService.sendCommand(agentId, 'choco list --local-only', 'powershell')
  },

  async listOutdated(agentId: string) {
    return apiService.sendCommand(agentId, 'choco outdated', 'powershell')
  },
}

// ─── Winget (via agent commands) ──────────────────────────────────

export const wingetService = {
  async searchPackages(agentId: string, query: string) {
    return apiService.sendCommand(agentId, `winget search "${query}"`, 'powershell')
  },

  async installPackage(agentId: string, packageId: string, version?: string) {
    const cmd = version
      ? `winget install --id ${packageId} --version ${version} --accept-source-agreements --accept-package-agreements`
      : `winget install --id ${packageId} --accept-source-agreements --accept-package-agreements`
    return apiService.sendCommand(agentId, cmd, 'powershell')
  },

  async updatePackage(agentId: string, packageId: string) {
    return apiService.sendCommand(agentId, `winget upgrade --id ${packageId} --accept-source-agreements --accept-package-agreements`, 'powershell')
  },

  async listOutdated(agentId: string) {
    return apiService.sendCommand(agentId, 'winget upgrade --available', 'powershell')
  },

  async listInstalled(agentId: string) {
    return apiService.sendCommand(agentId, 'winget list', 'powershell')
  },
}

// ─── Homebrew (macOS via agent commands) ──────────────────────────

export const homebrewService = {
  async searchPackages(agentId: string, query: string) {
    return apiService.sendCommand(agentId, `brew search "${query}"`, '/bin/bash')
  },

  async installPackage(agentId: string, packageId: string) {
    return apiService.sendCommand(agentId, `brew install ${packageId}`, '/bin/bash')
  },

  async updatePackage(agentId: string, packageId: string) {
    return apiService.sendCommand(agentId, `brew upgrade ${packageId}`, '/bin/bash')
  },

  async listOutdated(agentId: string) {
    return apiService.sendCommand(agentId, 'brew outdated', '/bin/bash')
  },

  async listInstalled(agentId: string) {
    return apiService.sendCommand(agentId, 'brew list --versions', '/bin/bash')
  },
}

// ─── Apt (Linux via agent commands) ──────────────────────────────

export const aptService = {
  async updateCache(agentId: string) {
    return apiService.sendCommand(agentId, 'apt update', '/bin/bash')
  },

  async listUpgradable(agentId: string) {
    return apiService.sendCommand(agentId, 'apt list --upgradable', '/bin/bash')
  },

  async upgradePackage(agentId: string, packageName: string) {
    return apiService.sendCommand(agentId, `apt install --only-upgrade -y ${packageName}`, '/bin/bash')
  },

  async fullUpgrade(agentId: string) {
    return apiService.sendCommand(agentId, 'apt upgrade -y', '/bin/bash')
  },

  async searchPackages(agentId: string, query: string) {
    return apiService.sendCommand(agentId, `apt search "${query}"`, '/bin/bash')
  },

  async listInstalled(agentId: string) {
    return apiService.sendCommand(agentId, 'apt list --installed', '/bin/bash')
  },
}

// ─── Patch Approval Workflow ──────────────────────────────────────

export const patchApprovalService = {
  async getPending() {
    return []
  },

  async approve(_patchIds: string[], _approver: string): Promise<void> {
    // Will call API endpoint
  },

  async deny(_patchIds: string[], _reason: string): Promise<void> {
    // Will call API endpoint
  },

  async getApproved() {
    return []
  },

  async getDenied() {
    return []
  },
}

// ─── Patch Policies ───────────────────────────────────────────────

export const patchPolicyService = {
  async list(): Promise<PatchPolicy[]> {
    return []
  },

  async create(policy: Omit<PatchPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<PatchPolicy> {
    const now = new Date().toISOString()
    return { ...policy, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
  },

  async update(id: string, policy: Partial<PatchPolicy>): Promise<PatchPolicy> {
    return { ...policy, id, updatedAt: new Date().toISOString() } as PatchPolicy
  },

  async delete(_id: string): Promise<void> {
    // Will call API endpoint
  },
}

// ─── Patch Scanning ───────────────────────────────────────────────

export const patchScanService = {
  async scanDevice(agentId: string): Promise<void> {
    return apiService.sendCommand(agentId, 'scan', 'powershell')
  },

  async getAvailableUpdates(agentId: string): Promise<Patch[]> {
    try {
      const data = await apiService.getUpdates(agentId)
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  },
}

// ─── Helper: Source selector ─────────────────────────────────────

export function getPatchSourceService(source: PatchSource) {
  switch (source) {
    case 'chocolatey': return chocolateyService
    case 'winget': return wingetService
    case 'brew': return homebrewService
    case 'apt': return aptService
  }
}

export default {
  chocolatey: chocolateyService,
  winget: wingetService,
  homebrew: homebrewService,
  apt: aptService,
  approval: patchApprovalService,
  policy: patchPolicyService,
  scan: patchScanService,
  getPatchSourceService,
}