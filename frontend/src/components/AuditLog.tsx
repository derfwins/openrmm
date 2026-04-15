import { useState } from 'react'

interface AuditLogEntry {
  id: string
  user: string
  action: string
  resource: string
  resourceType: string
  timestamp: string
  ipAddress: string
  details?: string
}

const AuditLog = () => {
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('all')
  const [filterResource, setFilterResource] = useState('all')
  const [dateRange, setDateRange] = useState('7d')
  const [page, setPage] = useState(1)

  // Demo data - will be replaced with API call
  const entries: AuditLogEntry[] = [
    { id: '1', user: 'admin', action: 'login', resource: 'admin', resourceType: 'user', timestamp: new Date().toISOString(), ipAddress: '10.10.0.118', details: 'Successful login' },
    { id: '2', user: 'admin', action: 'create', resource: 'script-daily-backup', resourceType: 'script', timestamp: new Date(Date.now() - 3600000).toISOString(), ipAddress: '10.10.0.118' },
    { id: '3', user: 'admin', action: 'deploy', resource: 'DESKTOP-460RMO6', resourceType: 'agent', timestamp: new Date(Date.now() - 7200000).toISOString(), ipAddress: '10.10.0.118', details: 'Agent installed via PowerShell' },
    { id: '4', user: 'tech1', action: 'remote_desktop', resource: 'fhowland-plex', resourceType: 'device', timestamp: new Date(Date.now() - 10800000).toISOString(), ipAddress: '10.10.0.50' },
    { id: '5', user: 'admin', action: 'patch_approve', resource: 'chrome-124.0', resourceType: 'patch', timestamp: new Date(Date.now() - 14400000).toISOString(), ipAddress: '10.10.0.118' },
    { id: '6', user: 'admin', action: 'automation_create', resource: 'auto-patch-critical', resourceType: 'automation', timestamp: new Date(Date.now() - 86400000).toISOString(), ipAddress: '10.10.0.118' },
    { id: '7', user: 'tech1', action: 'script_run', resource: 'disk-cleanup', resourceType: 'script', timestamp: new Date(Date.now() - 172800000).toISOString(), ipAddress: '10.10.0.50', details: 'Executed on 3 devices' },
    { id: '8', user: 'admin', action: 'user_create', resource: 'tech1', resourceType: 'user', timestamp: new Date(Date.now() - 259200000).toISOString(), ipAddress: '10.10.0.118' },
    { id: '9', user: 'admin', action: 'settings_update', resource: 'smtp-config', resourceType: 'settings', timestamp: new Date(Date.now() - 345600000).toISOString(), ipAddress: '10.10.0.118' },
    { id: '10', user: 'tech1', action: 'reboot', resource: 'DESKTOP-460RMO6', resourceType: 'device', timestamp: new Date(Date.now() - 432000000).toISOString(), ipAddress: '10.10.0.50' },
  ]

  const getActionColor = (action: string) => {
    switch (action) {
      case 'login': return 'bg-blue-500/20 text-blue-400'
      case 'create': return 'bg-green-500/20 text-green-400'
      case 'delete': return 'bg-red-500/20 text-red-400'
      case 'update': return 'bg-yellow-500/20 text-yellow-400'
      case 'deploy': return 'bg-purple-500/20 text-purple-400'
      case 'remote_desktop': return 'bg-indigo-500/20 text-indigo-400'
      case 'patch_approve': return 'bg-emerald-500/20 text-emerald-400'
      case 'automation_create': return 'bg-orange-500/20 text-orange-400'
      case 'script_run': return 'bg-cyan-500/20 text-cyan-400'
      case 'reboot': return 'bg-red-500/20 text-red-400'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'user': return '👤'
      case 'device': return '💻'
      case 'script': return '📜'
      case 'patch': return '🔧'
      case 'automation': return '⚡'
      case 'agent': return '🤖'
      case 'settings': return '⚙️'
      default: return '📄'
    }
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  const filteredEntries = entries.filter(e => {
    if (filterAction !== 'all' && e.action !== filterAction) return false
    if (filterResource !== 'all' && e.resourceType !== filterResource) return false
    if (search && !e.user.includes(search) && !e.resource.includes(search) && !e.action.includes(search)) return false
    return true
  })

  const uniqueActions = [...new Set(entries.map(e => e.action))]
  const uniqueResources = [...new Set(entries.map(e => e.resourceType))]

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Log</h1>
            <p className="text-gray-400 text-sm mt-1">Track all actions across your OpenRMM instance</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600">
              📥 Export CSV
            </button>
            <button className="px-3 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600">
              📥 Export PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <input
            type="text"
            placeholder="Search users, actions, resources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none text-sm"
          />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 text-sm"
          >
            <option value="all">All Actions</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>{a.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            value={filterResource}
            onChange={(e) => setFilterResource(e.target.value)}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 text-sm"
          >
            <option value="all">All Resources</option>
            {uniqueResources.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 text-sm"
          >
            <option value="1d">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Events', value: entries.length, color: 'text-white' },
            { label: 'Logins', value: entries.filter(e => e.action === 'login').length, color: 'text-blue-400' },
            { label: 'Changes', value: entries.filter(e => ['create', 'update', 'delete'].includes(e.action)).length, color: 'text-yellow-400' },
            { label: 'Remote Sessions', value: entries.filter(e => e.action === 'remote_desktop').length, color: 'text-indigo-400' },
          ].map(card => (
            <div key={card.label} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-xs">{card.label}</div>
              <div className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Log Table */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-gray-400 text-xs font-medium">Time</th>
                  <th className="text-left px-4 py-3 text-gray-400 text-xs font-medium">User</th>
                  <th className="text-left px-4 py-3 text-gray-400 text-xs font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-gray-400 text-xs font-medium">Resource</th>
                  <th className="text-left px-4 py-3 text-gray-400 text-xs font-medium">IP Address</th>
                  <th className="text-left px-4 py-3 text-gray-400 text-xs font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map(entry => (
                  <tr key={entry.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-300 text-sm whitespace-nowrap">
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-white text-sm font-medium">
                      {entry.user}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getActionColor(entry.action)}`}>
                        {entry.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">
                      <span className="mr-1.5">{getResourceIcon(entry.resourceType)}</span>
                      {entry.resource}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                      {entry.ipAddress}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {entry.details || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-700 flex justify-between items-center">
            <span className="text-gray-400 text-xs">
              Showing {filteredEntries.length} of {entries.length} entries
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-700 text-white text-xs rounded disabled:opacity-50"
              >
                ← Prev
              </button>
              <span className="px-3 py-1 text-white text-xs">Page {page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 bg-gray-700 text-white text-xs rounded"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuditLog