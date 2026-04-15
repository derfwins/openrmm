import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import apiService from '../services/apiService'

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [agent, setAgent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'checks' | 'scripts' | 'events'>('overview')
  const [commandInput, setCommandInput] = useState('')
  const [commandOutput, setCommandOutput] = useState<string | null>(null)
  const [commandRunning, setCommandRunning] = useState(false)

  useEffect(() => {
    if (id) loadAgent()
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

  if (loading) {
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
                <span>{agent.plat === 'windows' ? '🪟' : agent.plat === 'linux' ? '🐧' : '🍎'} {agent.plat || 'Unknown'}</span>
                <span>·</span>
                <span className="font-mono">{agent.local_ip || agent.wan_ip || '—'}</span>
                <span>·</span>
                <span>{agent.client_name || '—'} / {agent.site_name || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href="/remote"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              🖥️ Remote Desktop
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['overview', 'checks', 'scripts', 'events'] as const).map(tab => (
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
                  <InfoRow label="Operating System" value={agent.operating_system || agent.os_detail || '—'} />
                  <InfoRow label="IP Address (LAN)" value={agent.local_ip || '—'} />
                  <InfoRow label="IP Address (WAN)" value={agent.wan_ip || '—'} />
                  <InfoRow label="Agent Version" value={agent.version || '—'} />
                  <InfoRow label="Last Seen" value={agent.last_seen ? new Date(agent.last_seen).toLocaleString() : '—'} />
                  <InfoRow label="Time Zone" value={agent.time_zone || '—'} />
                  <InfoRow label="Monitoring Type" value={agent.monitoring_type || '—'} />
                </div>
              </div>

              {/* Quick Stats */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Health</h3>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Checks" value={agent.checks?.length || 0} icon="✅" />
                  <MiniStat label="Pending Updates" value={agent.pending_updates_count || 0} icon="📦" />
                  <MiniStat label="Services" value={agent.services?.length || 0} icon="⚙️" />
                  <MiniStat label="Uptime" value={agent.uptime || '—'} icon="⏱️" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'checks' && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm">Checks will appear here when the agent reports back</p>
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