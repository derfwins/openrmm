import { useState } from 'react'
import type { Patch } from '../types/patch'
import type { PatchPolicy, PatchSeverity, PatchSource, PatchPolicySchedule } from '../types/patchPolicy'

type Tab = 'available' | 'approved' | 'denied' | 'policies'

const SEVERITY_CONFIG: Record<PatchSeverity, { label: string; bg: string; text: string; dot: string }> = {
  critical: { label: 'Critical', bg: 'bg-red-900/30', text: 'text-red-400', dot: 'bg-red-500' },
  important: { label: 'Important', bg: 'bg-orange-900/30', text: 'text-orange-400', dot: 'bg-orange-500' },
  moderate: { label: 'Moderate', bg: 'bg-yellow-900/30', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  low: { label: 'Low', bg: 'bg-blue-900/30', text: 'text-blue-400', dot: 'bg-blue-500' },
}

const SOURCE_LABELS: Record<PatchSource, string> = {
  chocolatey: 'Choco',
  winget: 'Winget',
  brew: 'Brew',
  apt: 'Apt',
}

// Demo data
const DEMO_PATCHES: (Patch & { source: PatchSource; devices: number })[] = [
  { id: '1', name: 'Chrome', description: 'Google Chrome browser update', severity: 'critical', category: 'security', platform: 'windows', version: '124.0.6367.91', releaseDate: '2024-04-15', rebootRequired: false, source: 'winget', devices: 42 },
  { id: '2', name: 'Firefox', description: 'Mozilla Firefox security update', severity: 'important', category: 'security', platform: 'windows', version: '125.0.2', releaseDate: '2024-04-14', rebootRequired: false, source: 'winget', devices: 38 },
  { id: '3', name: 'curl', description: 'curl URL transfer library', severity: 'critical', category: 'security', platform: 'linux', version: '8.7.1', releaseDate: '2024-04-12', rebootRequired: false, source: 'apt', devices: 15 },
  { id: '4', name: 'vscode', description: 'Visual Studio Code', severity: 'moderate', category: 'feature', platform: 'windows', version: '1.88.0', releaseDate: '2024-04-10', rebootRequired: false, source: 'chocolatey', devices: 20 },
  { id: '5', name: 'openssl', description: 'OpenSSL security patch', severity: 'critical', category: 'security', platform: 'linux', version: '3.2.1', releaseDate: '2024-04-09', rebootRequired: true, source: 'apt', devices: 15 },
  { id: '6', name: 'nodejs', description: 'Node.js runtime', severity: 'moderate', category: 'feature', platform: 'macos', version: '20.12.0', releaseDate: '2024-04-08', rebootRequired: false, source: 'brew', devices: 8 },
  { id: '7', name: '7zip', description: '7-Zip archiver', severity: 'low', category: 'bugfix', platform: 'windows', version: '23.09', releaseDate: '2024-04-07', rebootRequired: false, source: 'chocolatey', devices: 42 },
  { id: '8', name: 'docker-desktop', description: 'Docker Desktop update', severity: 'important', category: 'security', platform: 'windows', version: '4.29.0', releaseDate: '2024-04-06', rebootRequired: true, source: 'winget', devices: 12 },
]

const DEMO_POLICIES: PatchPolicy[] = [
  {
    id: 'p1', name: 'Critical Auto-Approve', description: 'Automatically approve and install critical security patches', enabled: true,
    schedule: { frequency: 'daily', time: '02:00', timezone: 'UTC' },
    targets: { type: 'all' },
    approvalRules: { autoApproveSeverity: ['critical'], requireApprovalAbove: 'low', deadlineDays: 7 },
    blackoutWindows: [{ id: 'bw1', name: 'Business Hours', daysOfWeek: [1,2,3,4,5], startTime: '08:00', endTime: '18:00', timezone: 'UTC' }],
    rebootBehavior: 'prompt',
    createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-04-01T00:00:00Z',
  },
  {
    id: 'p2', name: 'Weekly Feature Updates', description: 'Weekly schedule for non-critical updates with manual approval', enabled: true,
    schedule: { frequency: 'weekly', dayOfWeek: 6, time: '03:00', timezone: 'UTC' },
    targets: { type: 'group', groupIds: ['g1'] },
    approvalRules: { autoApproveSeverity: [], requireApprovalAbove: 'low', deadlineDays: 14 },
    blackoutWindows: [],
    rebootBehavior: 'never',
    createdAt: '2024-02-15T00:00:00Z', updatedAt: '2024-03-20T00:00:00Z',
  },
]

const PatchManager = () => {
  const [activeTab, setActiveTab] = useState<Tab>('available')
  const [patches, setPatches] = useState<typeof DEMO_PATCHES>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [severityFilter, setSeverityFilter] = useState<PatchSeverity | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<PatchSource | 'all'>('all')
  const [policies, setPolicies] = useState(DEMO_POLICIES)
  const [showPolicyBuilder, setShowPolicyBuilder] = useState(false)

  const stats = {
    critical: patches.filter(p => p.severity === 'critical').length,
    important: patches.filter(p => p.severity === 'important').length,
    moderate: patches.filter(p => p.severity === 'moderate').length,
    low: patches.filter(p => p.severity === 'low').length,
  }

  const filtered = patches.filter(p => {
    if (severityFilter !== 'all' && p.severity !== severityFilter) return false
    if (sourceFilter !== 'all' && p.source !== sourceFilter) return false
    return true
  })

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(p => p.id)))
  }
  const clearSelection = () => setSelected(new Set())

  const handleApprove = () => {
    setPatches(prev => prev.filter(p => !selected.has(p.id)))
    clearSelection()
  }
  const handleDeny = () => {
    setPatches(prev => prev.filter(p => !selected.has(p.id)))
    clearSelection()
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Patch Management</h1>
          <p className="text-gray-400 text-sm mt-1">Manage updates across all devices</p>
        </div>
        <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          🔍 Scan All Devices
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['critical', 'important', 'moderate', 'low'] as PatchSeverity[]).map(sev => {
          const cfg = SEVERITY_CONFIG[sev]
          return (
            <div key={sev} className={`rounded-xl border border-gray-700 ${cfg.bg} p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-bold ${cfg.text}`}>{stats[sev]}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{cfg.label}</p>
                </div>
                <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        {(['available', 'approved', 'denied', 'policies'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); clearSelection() }}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
              activeTab === tab
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab}
            {tab === 'available' && ` (${patches.length})`}
          </button>
        ))}
      </div>

      {/* Available / Approved / Denied Tabs */}
      {(activeTab === 'available' || activeTab === 'approved' || activeTab === 'denied') && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value as PatchSeverity | 'all')}
              className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Severities</option>
              {(['critical', 'important', 'moderate', 'low'] as PatchSeverity[]).map(s => (
                <option key={s} value={s}>{SEVERITY_CONFIG[s].label}</option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as PatchSource | 'all')}
              className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Sources</option>
              {(['chocolatey', 'winget', 'brew', 'apt'] as PatchSource[]).map(s => (
                <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
              ))}
            </select>
            {selected.size > 0 && (
              <div className="flex gap-2 ml-auto">
                <button onClick={handleApprove} className="px-3 py-1.5 text-sm bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg hover:bg-green-600/30 transition-colors">
                  ✓ Approve ({selected.size})
                </button>
                <button onClick={handleDeny} className="px-3 py-1.5 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors">
                  ✗ Deny ({selected.size})
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-left">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleAll}
                      className="rounded bg-gray-700 border-gray-600"
                    />
                  </th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Devices</th>
                  <th className="px-4 py-3">Reboot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filtered.map(patch => {
                  const cfg = SEVERITY_CONFIG[patch.severity]
                  return (
                    <tr key={patch.id} className={`hover:bg-gray-750 transition-colors ${selected.has(patch.id) ? 'bg-blue-900/10' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(patch.id)}
                          onChange={() => toggleSelect(patch.id)}
                          className="rounded bg-gray-700 border-gray-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{patch.name}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{patch.description}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs">{patch.version}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300">
                          {SOURCE_LABELS[patch.source]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{patch.devices}</td>
                      <td className="px-4 py-3">
                        {patch.rebootRequired ? <span className="text-yellow-400 text-xs">🔄 Yes</span> : <span className="text-gray-500 text-xs">No</span>}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && patches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center animate-[fadeIn_0.5s_ease-out]">
                        <div className="w-56 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6 space-y-3">
                          <div className="text-4xl">✨</div>
                          <h2 className="text-sm font-semibold text-white">All caught up!</h2>
                          <p className="text-xs text-gray-400">No patches pending. Devices are up to date!</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No patches match current filters
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowPolicyBuilder(true)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              + Create Policy
            </button>
          </div>
          {policies.map(policy => (
            <div key={policy.id} className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-medium">{policy.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${policy.enabled ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                    {policy.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600">Edit</button>
                  <button className="px-3 py-1 text-xs bg-red-900/30 text-red-400 rounded hover:bg-red-900/50">Delete</button>
                </div>
              </div>
              <p className="text-gray-400 text-sm">{policy.description}</p>
              <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                <span>📅 {policy.schedule.frequency} @ {policy.schedule.time}</span>
                <span>🎯 {policy.targets.type === 'all' ? 'All devices' : policy.targets.type === 'group' ? 'Specific groups' : 'Specific devices'}</span>
                <span>🔄 Reboot: {policy.rebootBehavior}</span>
                <span>✅ Auto-approve: {policy.approvalRules.autoApproveSeverity.join(', ') || 'none'}</span>
                {policy.blackoutWindows.length > 0 && <span>🚫 {policy.blackoutWindows.length} blackout window(s)</span>}
              </div>
            </div>
          ))}
          {policies.length === 0 && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-sm text-gray-400">No patch policies yet</p>
            </div>
          )}
        </div>
      )}

      {/* Policy Builder Modal */}
      {showPolicyBuilder && (
        <PolicyBuilderModal onClose={() => setShowPolicyBuilder(false)} onSave={p => { setPolicies(prev => [...prev, p]); setShowPolicyBuilder(false) }} />
      )}
    </div>
  )
}

const PolicyBuilderModal = ({ onClose, onSave }: { onClose: () => void; onSave: (p: PatchPolicy) => void }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [schedule, setSchedule] = useState<PatchPolicySchedule>({ frequency: 'daily', time: '02:00', timezone: 'UTC' })
  const [rebootBehavior, setRebootBehavior] = useState<PatchPolicy['rebootBehavior']>('prompt')
  const [autoApprove, setAutoApprove] = useState<PatchSeverity[]>([])
  const [deadlineDays, setDeadlineDays] = useState(7)

  const handleSave = () => {
    if (!name.trim()) return
    const now = new Date().toISOString()
    onSave({
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      enabled: true,
      schedule,
      targets: { type: 'all' },
      approvalRules: { autoApproveSeverity: autoApprove, requireApprovalAbove: 'low', deadlineDays },
      blackoutWindows: [],
      rebootBehavior,
      createdAt: now,
      updatedAt: now,
    })
  }

  const toggleAutoApprove = (sev: PatchSeverity) => {
    setAutoApprove(prev => prev.includes(sev) ? prev.filter(s => s !== sev) : [...prev, sev])
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Create Patch Policy</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Policy Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Critical Auto-Approve"
              className="w-full px-4 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What does this policy do?"
              className="w-full px-4 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Schedule</label>
            <div className="flex gap-3">
              {(['daily', 'weekly', 'monthly'] as const).map(f => (
                <button key={f} onClick={() => setSchedule((prev: PatchPolicySchedule) => ({ ...prev, frequency: f }))}
                  className={`px-4 py-2 text-sm rounded-lg capitalize ${schedule.frequency === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-3">
              <input type="time" value={schedule.time} onChange={e => setSchedule((prev: PatchPolicySchedule) => ({ ...prev, time: e.target.value }))}
                className="px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500" />
              <select value={schedule.timezone} onChange={e => setSchedule((prev: PatchPolicySchedule) => ({ ...prev, timezone: e.target.value }))}
                className="px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500">
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Auto-Approve Severities</label>
            <div className="flex gap-2">
              {(['critical', 'important', 'moderate', 'low'] as PatchSeverity[]).map(sev => (
                <button key={sev} onClick={() => toggleAutoApprove(sev)}
                  className={`px-3 py-1.5 text-xs rounded-lg capitalize ${autoApprove.includes(sev) ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                  {sev}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-1">Deadline (days)</label>
              <input type="number" value={deadlineDays} onChange={e => setDeadlineDays(parseInt(e.target.value) || 7)} min={1} max={90}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-1">Reboot Behavior</label>
              <select value={rebootBehavior} onChange={e => setRebootBehavior(e.target.value as PatchPolicy['rebootBehavior'])}
                className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500">
                <option value="automatic">Automatic</option>
                <option value="prompt">Prompt User</option>
                <option value="never">Never</option>
              </select>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">Create Policy</button>
        </div>
      </div>
    </div>
  )
}

export default PatchManager