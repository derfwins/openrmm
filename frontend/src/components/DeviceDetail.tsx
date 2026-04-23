import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import apiService from '../services/apiService'
import Terminal from './Terminal'
import meshCentral from '../services/meshCentralService'

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [agent, setAgent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'checks' | 'scripts' | 'events' | 'services'>('overview')
  const [commandInput, setCommandInput] = useState('')
  const [commandOutput, setCommandOutput] = useState<string | null>(null)
  const [commandRunning, setCommandRunning] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [token] = useState(() => localStorage.getItem('token') || '')
  const [serviceFilter, setServiceFilter] = useState('')
  const [serviceActionLoading, setServiceActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (id) loadAgent()
    const interval = setInterval(() => { if (id) loadAgent() }, 30000)
    return () => clearInterval(interval)
  }, [id])

  const loadAgent = async () => {
    try {
      setLoading(true)
      const data = await apiService.getDevice(id!)
      setAgent(data)
    } catch (err) {
      console.error('Failed to load agent:', err)
    } finally {
      setLoading(false)
    }
  }

  const runCommand = async () => {
    if (!commandInput.trim() || !id) return
    setCommandRunning(true)
    setCommandOutput(null)
    try {
      const result = await apiService.sendCommand(id, commandInput, agent?.plat === 'linux' ? 'bash' : 'powershell')
      setCommandOutput(JSON.stringify(result, null, 2))
    } catch (err: any) {
      setCommandOutput(`Error: ${err.message}`)
    } finally {
      setCommandRunning(false)
    }
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 ** 3)
    return `${gb.toFixed(1)} GB`
  }

  const parseJsonSafe = (str: string, fallback: any = null) => {
    try { return JSON.parse(str) } catch { return fallback }
  }

  if (loading && !agent) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent"></div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-gray-500 dark:text-gray-400">Agent not found</p>
          <Link to="/devices" className="text-blue-500 hover:underline text-sm mt-2 inline-block">← Back to devices</Link>
        </div>
      </div>
    )
  }

  const disks = parseJsonSafe(agent.disks_json, [])
  const memory = parseJsonSafe(agent.memory_json, {})
  const users = parseJsonSafe(agent.logged_in_users, [])

  const handleServiceAction = async (action: string, serviceName: string) => {
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} service "${serviceName}"?`)) return
    setServiceActionLoading(serviceName + action)
    try {
      const res = await fetch(`/agents/${id}/service/?action=${action}&service_name=${encodeURIComponent(serviceName)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        // Refresh agent data after a short delay to allow the service to change state
        setTimeout(() => loadAgent(), 2000)
      } else {
        alert('Failed to send service command')
      }
    } catch {
      alert('Failed to send service command')
    } finally {
      setServiceActionLoading(null)
    }
  }

  const services = parseJsonSafe(agent.services_json, [])
  const cpuPct = agent.cpu_percent ?? 0
  const memPct = memory.percent ?? 0

  return (
    <div className="p-6 space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link to="/devices" className="hover:text-blue-500">Devices</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white font-medium">{agent.hostname || id}</span>
      </div>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-4 h-4 rounded-full ${agent.status === 'online' ? 'bg-green-500 status-online' : 'bg-gray-400'}`} />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{agent.hostname || 'Unknown'}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <span>{agent.plat === 'windows' ? '🪟' : agent.plat === 'linux' ? '🐧' : '🍎'} {agent.os_name || agent.plat || 'Unknown'}</span>
                <span>·</span>
                <span className="font-mono">{agent.local_ip || '—'}</span>
                <span>·</span>
                <span>{agent.public_ip || '—'}</span>
                <span>·</span>
                <span>v{agent.version || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTerminal(!showTerminal)}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${showTerminal ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              💻 {showTerminal ? 'Hide Terminal' : 'Terminal'}
            </button>
            {agent.status === 'online' && (
              <button
                onClick={() => meshCentral.openDesktop(agent.mesh_node_id || agent.agent_id)}
                className="px-4 py-2 text-sm rounded-lg transition-colors bg-purple-600 text-white hover:bg-purple-700"
              >
                🖥️ Remote Desktop
              </button>
            )}
            {agent.status === 'online' && (
              <button
                onClick={() => meshCentral.openFiles(agent.mesh_node_id || agent.agent_id)}
                className="px-4 py-2 text-sm rounded-lg transition-colors bg-green-600 text-white hover:bg-green-700"
              >
                📁 Files
              </button>
            )}
            {agent.status === 'online' && (
              <button
                onClick={async () => {
                  if (confirm('Restart the agent on this device?')) {
                    await fetch(`/agents/${id}/restart/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
                  }
                }}
                className="px-4 py-2 text-sm rounded-lg transition-colors bg-orange-600 text-white hover:bg-orange-700"
              >
                🔄 Restart Agent
              </button>
            )}
            <button
              onClick={async () => {
                const name = agent.hostname || id
                if (!confirm(`Delete "${name}" from OpenRMM?`)) return
                const uninstall = confirm('Also uninstall the agent from the machine? (This will stop the service and remove all files.)')
                try {
                  const res = await fetch(`/agents/${id}/?uninstall=${uninstall}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
                  if (res.ok) {
                    window.location.href = '/devices'
                  } else {
                    alert('Failed to delete device')
                  }
                } catch (e) {
                  alert('Failed to delete device: ' + e)
                }
              }}
              className="px-4 py-2 text-sm rounded-lg transition-colors bg-red-600 text-white hover:bg-red-700"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      </div>

      {/* Terminal Panel */}
      {showTerminal && (
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden" style={{ height: '400px' }}>
          <Terminal agentId={id || ''} token={token} />
        </div>
      )}

      {/* Health Bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CPU */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CPU</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{cpuPct.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${cpuPct > 90 ? 'bg-red-500' : cpuPct > 70 ? 'bg-yellow-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(cpuPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{agent.cpu_model || '—'}</p>
        </div>

        {/* Memory */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{memPct.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${memPct > 90 ? 'bg-red-500' : memPct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(memPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {memory.used_gb?.toFixed(1) || '—'} / {memory.total_gb?.toFixed(1) || '—'} GB
          </p>
        </div>

        {/* Disk - show first disk */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          {disks.length > 0 ? (() => {
            const disk = disks[0]
            return (
              <>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Disk ({disk.drive})</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{disk.percent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${disk.percent > 90 ? 'bg-red-500' : disk.percent > 70 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                    style={{ width: `${Math.min(disk.percent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {disk.used_gb?.toFixed(1) || '—'} / {disk.total_gb?.toFixed(1) || '—'} GB
                </p>
              </>
            )
          })() : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No disk data</p>
          )}
        </div>
      </div>

      {/* Additional disks if any */}
      {disks.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {disks.slice(1).map((disk: any, i: number) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Disk ({disk.drive})</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{disk.percent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${disk.percent > 90 ? 'bg-red-500' : disk.percent > 70 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                  style={{ width: `${Math.min(disk.percent, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {disk.used_gb?.toFixed(1)} / {disk.total_gb?.toFixed(1)} GB
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['overview', 'services', 'checks', 'scripts', 'events'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* System Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">System Information</h3>
                <div className="space-y-2">
                  <InfoRow label="Hostname" value={agent.hostname} />
                  <InfoRow label="Operating System" value={`${agent.os_name || ''} ${agent.os_version || ''}`} />
                  <InfoRow label="CPU" value={`${agent.cpu_model || '—'} (${agent.cpu_cores || 0} cores)`} />
                  <InfoRow label="RAM" value={agent.total_ram ? formatBytes(agent.total_ram) : '—'} />
                  <InfoRow label="IP Address (LAN)" value={agent.local_ip || '—'} />
                  <InfoRow label="IP Address (WAN)" value={agent.public_ip || '—'} />
                  <InfoRow label="Agent Version" value={`v${agent.version || '—'}`} />
                  <InfoRow label="Last Seen" value={agent.last_seen ? new Date(agent.last_seen).toLocaleString() : '—'} />
                  <InfoRow label="Uptime" value={agent.uptime_seconds ? formatUptime(agent.uptime_seconds) : '—'} />
                  <InfoRow label="Monitoring Type" value={agent.monitoring_type || '—'} />
                </div>
              </div>

              {/* Quick Stats */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Activity</h3>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Services" value={services.length || '—'} icon="🔧" />
                  <MiniStat label="Processes" value={agent.running_processes ?? '—'} icon="⚙️" />
                  <MiniStat label="CPU Usage" value={`${cpuPct.toFixed(1)}%`} icon="🔥" />
                  <MiniStat label="Memory Usage" value={`${memPct.toFixed(1)}%`} icon="🧠" />
                  <MiniStat label="Logged-in Users" value={users.length || '—'} icon="👤" />
                </div>
                {users.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Logged-in Users</h4>
                    <div className="flex flex-wrap gap-2">
                      {users.map((u: string) => (
                        <span key={u} className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">{u}</span>
                      ))}
                    </div>
                  </div>
                )}
                {disks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">All Disks</h4>
                    <div className="space-y-2">
                      {disks.map((d: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <span className="font-mono text-gray-600 dark:text-gray-400 w-12">{d.drive}</span>
                          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${d.percent > 90 ? 'bg-red-500' : d.percent > 70 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                              style={{ width: `${Math.min(d.percent, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-24 text-right">
                            {d.free_gb?.toFixed(1)} GB free
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'checks' && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm">Checks will appear here when configured</p>
            </div>
          )}

          {activeTab === 'scripts' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Run Command</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commandInput}
                  onChange={e => setCommandInput(e.target.value)}
                  placeholder={agent.plat === 'linux' ? 'Enter bash command...' : 'Enter PowerShell command...'}
                  className="flex-1 px-4 py-2 text-sm font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:text-white"
                  onKeyDown={e => e.key === 'Enter' && runCommand()}
                />
                <button
                  onClick={runCommand}
                  disabled={commandRunning || !commandInput.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {commandRunning ? 'Running...' : 'Run'}
                </button>
              </div>
              {commandOutput && (
                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto max-h-96">
                  {commandOutput}
                </pre>
              )}
            </div>
          )}

          {activeTab === 'services' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Services ({services.length})</h3>
                <input
                  type="text"
                  value={serviceFilter}
                  onChange={e => setServiceFilter(e.target.value)}
                  placeholder="Filter services..."
                  className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white w-64"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Name</th>
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Display Name</th>
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Start Type</th>
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services
                      .filter((svc: any) => !serviceFilter || svc.name.toLowerCase().includes(serviceFilter.toLowerCase()) || svc.display_name.toLowerCase().includes(serviceFilter.toLowerCase()))
                      .map((svc: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="py-1.5 px-3 font-mono text-xs text-gray-700 dark:text-gray-300">{svc.name}</td>
                        <td className="py-1.5 px-3 text-gray-700 dark:text-gray-300">{svc.display_name}</td>
                        <td className="py-1.5 px-3">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            svc.status === 'running' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                            svc.status === 'stopped' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                            'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                          }`}>{svc.status}</span>
                        </td>
                        <td className="py-1.5 px-3 text-gray-500 dark:text-gray-400 text-xs">{svc.start_type}</td>
                        <td className="py-1.5 px-3">
                          <div className="flex gap-1">
                            {svc.status === 'stopped' && (
                              <button
                                onClick={() => handleServiceAction('start', svc.name)}
                                disabled={serviceActionLoading === svc.name + 'start'}
                                className="px-2 py-0.5 text-xs rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50"
                              >▶ Start</button>
                            )}
                            {svc.status === 'running' && (
                              <button
                                onClick={() => handleServiceAction('stop', svc.name)}
                                disabled={serviceActionLoading === svc.name + 'stop'}
                                className="px-2 py-0.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                              >⏹ Stop</button>
                            )}
                            <button
                              onClick={() => handleServiceAction('restart', svc.name)}
                              disabled={serviceActionLoading === svc.name + 'restart'}
                              className="px-2 py-0.5 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50"
                            >🔄 Restart</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-sm">Event log will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
    <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-sm font-medium text-gray-900 dark:text-white">{value}</span>
  </div>
)

const MiniStat = ({ label, value, icon }: { label: string; value: any; icon: string }) => (
  <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3 flex items-center gap-3">
    <span className="text-lg">{icon}</span>
    <div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  </div>
)

export default DeviceDetail