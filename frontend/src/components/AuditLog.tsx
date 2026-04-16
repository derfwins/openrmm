import { useState, useEffect, useCallback } from 'react'

interface AuditLogEntry {
  id: number
  username: string
  action: string
  resource_type: string | null
  resource_id: string | null
  description: string | null
  ip_address: string | null
  timestamp: string
}

const AuditLog = () => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('all')
  const [filterResource, setFilterResource] = useState('all')
  const [loading, setLoading] = useState(true)

  const loadLogs = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch('/audit/', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setEntries(data)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadLogs()
    const iv = setInterval(loadLogs, 60000)
    return () => clearInterval(iv)
  }, [loadLogs])

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

  const getResourceIcon = (type: string | null) => {
    switch (type) {
      case 'user': return '👤'
      case 'device': case 'agent': return '💻'
      case 'script': return '📜'
      case 'patch': return '🔧'
      case 'automation': return '⚡'
      case 'settings': return '⚙️'
      case 'client': return '🏢'
      default: return '📌'
    }
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleString()
  }

  // Get unique actions and resource types for filters
  const uniqueActions = [...new Set(entries.map(e => e.action))].sort()
  const uniqueResources = [...new Set(entries.filter(e => e.resource_type).map(e => e.resource_type!))].sort()

  // Filter entries
  const filtered = entries.filter(e => {
    if (filterAction !== 'all' && e.action !== filterAction) return false
    if (filterResource !== 'all' && e.resource_type !== filterResource) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (e.username || '').toLowerCase().includes(q) ||
        (e.action || '').toLowerCase().includes(q) ||
        (e.resource_id || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.ip_address || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1">{entries.length} log entries</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search users, actions, resources..."
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 w-64"
        />
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 focus:outline-none"
        >
          <option value="all">All Actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={filterResource}
          onChange={e => setFilterResource(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 focus:outline-none"
        >
          <option value="all">All Resources</option>
          {uniqueResources.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Log Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 animate-pulse">Loading audit log...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl p-8 inline-block">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400 text-sm">No audit log entries yet.</p>
            <p className="text-gray-600 text-xs mt-1">Actions will appear here as users interact with the system.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{formatTime(entry.timestamp)}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{entry.username}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${getActionColor(entry.action)}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    <span className="mr-1.5">{getResourceIcon(entry.resource_type)}</span>
                    {entry.resource_id || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{entry.description || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{entry.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AuditLog