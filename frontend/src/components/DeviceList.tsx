import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import apiService from '../services/apiService'
import { useClient } from '../contexts/ClientContext'
import { IconDesktop, IconSearch } from './Icons'


const DeviceList = () => {
  const { selectedClient } = useClient()
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async (agent: any) => {
    const name = agent.hostname || agent.agent_id || 'this device'
    const uninstall = confirm(`Delete "${name}" from OpenRMM?\n\nClick OK to also send an uninstall command to remove the agent from the machine.\nClick Cancel to only remove from the database (agent will re-register on next heartbeat).`)
    if (!uninstall) return
    const removeFromMachine = confirm(`Also remove the agent software from the machine?\nThis will stop the agent service and delete its files.`)
    try {
      await apiService.deleteDevice(agent.agent_id || agent.id, removeFromMachine)
      setAgents(prev => prev.filter(a => (a.agent_id || a.id) !== (agent.agent_id || agent.id)))
    } catch (e) {
      alert('Failed to delete device: ' + e)
    }
  }
  const [search, setSearch] = useState('')


  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'hostname' | 'status' | 'last_seen'>('hostname')

  useEffect(() => { loadAgents() }, [selectedClient?.id])

  const loadAgents = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiService.getDevices(selectedClient?.id)
      const list = data.results || data || []
      setAgents(list)
    } catch (err: any) {
      if (err?.message?.includes('403') || err?.message?.includes('401')) {
        setError('Session expired')
      } else {
        setError('Failed to load agents')
      }
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let result = [...agents]

    // Search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        (a.hostname || '').toLowerCase().includes(q) ||
        (a.local_ip || '').includes(q) ||
        (a.wan_ip || '').includes(q) ||
        (a.site_name || '').toLowerCase().includes(q) ||
        (a.client_name || '').toLowerCase().includes(q)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(a => a.status === statusFilter)
    }

    // Platform filter
    if (platformFilter !== 'all') {
      result = result.filter(a => a.plat === platformFilter)
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'hostname': return (a.hostname || '').localeCompare(b.hostname || '')
        case 'status': return (a.status || '').localeCompare(b.status || '')
        case 'last_seen': return new Date(b.last_seen || 0).getTime() - new Date(a.last_seen || 0).getTime()
        default: return 0
      }
    })

    return result
  }, [agents, search, statusFilter, platformFilter, sortBy])

  const onlineCount = agents.filter(a => a.status === 'online').length
  const offlineCount = agents.filter(a => a.status !== 'online').length
  const platforms = [...new Set(agents.map(a => a.plat).filter(Boolean))]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent"></div>
          <span className="text-gray-500 dark:text-gray-400 text-sm">Loading agents...</span>
        </div>
      </div>
    )
  }

  if (!loading && agents.length === 0 && !error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md animate-[fadeIn_0.5s_ease-out]">
          <div className="mx-auto w-64 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-8 space-y-4 dark:bg-gray-900/50">
            <div className="text-5xl"><IconDesktop size={16} /></div>
            <h2 className="text-lg font-semibold text-white">No devices enrolled yet</h2>
            <p className="text-sm text-gray-400">Install the OpenRMM agent on your devices to start managing them.</p>
            <Link
              to="/install"
              className="inline-block px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              Install Agent
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Devices</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {agents.length} total · {onlineCount} online · {offlineCount} offline
          </p>
        </div>
        <button
          onClick={loadAgents}
          className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          <span className={loading ? 'animate-spin' : ''}>↻</span> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-2.5 text-gray-400"><IconSearch size={16} /></span>
          <input
            type="text"
            placeholder="Search hostname, IP, site..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white"
          />
        </div>

        {/* Status Filter */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {(['all', 'online', 'offline'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {s === 'all' ? `${agents.length}` : s === 'online' ? `🟢 ${onlineCount}` : `🔴 ${offlineCount}`}
            </button>
          ))}
        </div>

        {/* Platform Filter */}
        {platforms.length > 0 && (
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
          >
            <option value="all">All Platforms</option>
            {platforms.map(p => (
              <option key={p} value={p}>{p === 'windows' ? '🪟 Windows' : p === 'linux' ? '🐧 Linux' : p === 'darwin' ? '🍎 macOS' : p}</option>
            ))}
          </select>
        )}

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          className="px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
        >
          <option value="hostname">Sort: Name</option>
          <option value="status">Sort: Status</option>
          <option value="last_seen">Sort: Last Seen</option>
        </select>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Hostname</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">IP Address</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Client / Site</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Platform</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Seen</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="text-4xl mb-3"><IconDesktop size={16} /></div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {agents.length === 0 ? 'No agents installed yet' : 'No agents match your filters'}
                  </p>
                  {agents.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Install the OpenRMM agent on devices to start monitoring
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map(agent => (
                <tr key={agent.agent_id || agent.id} className="table-row-hover hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-4 py-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${agent.status === 'online' ? 'bg-green-500 status-online' : 'bg-gray-400'}`} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/device/${agent.agent_id || agent.id}`}
                      className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {agent.hostname || 'Unknown'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
                    {agent.local_ip || agent.wan_ip || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {agent.client_name || '—'} / {agent.site_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <PlatformIcon plat={agent.plat} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {agent.last_seen ? timeAgo(agent.last_seen) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/device/${agent.agent_id || agent.id}`}
                        className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                      >
                        Manage →
                      </Link>
                      <button
                        onClick={() => handleDelete(agent)}
                        className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete device"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
          Showing {filtered.length} of {agents.length} agents
        </p>
      )}
    </div>
  )
}

const PlatformIcon = ({ plat }: { plat: string }) => {
  const icons: Record<string, { icon: string; label: string }> = {
    windows: { icon: '🪟', label: 'Windows' },
    linux: { icon: '🐧', label: 'Linux' },
    darwin: { icon: '🍎', label: 'macOS' },
  }
  const info = icons[plat] || { icon: '💻', label: plat }
  return <span title={info.label}>{info.icon} <span className="text-gray-500 dark:text-gray-400">{info.label}</span></span>
}

const timeAgo = (dateStr: string): string => {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default DeviceList