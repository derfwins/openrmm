import { useState, useEffect } from 'react'
import type { AgentInfo, AgentCommand } from '../types/agent'
import { apiService } from '../services/apiService'

type Tab = 'overview' | 'commands' | 'history' | 'services'

interface Props {
  agentId: string
  onBack?: () => void
}

const AgentDetail = ({ agentId, onBack }: Props) => {
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [commands, setCommands] = useState<AgentCommand[]>([])
  const [cmdInput, setCmdInput] = useState('')
  const [cmdShell, setCmdShell] = useState<'powershell' | 'bash' | 'python'>('powershell')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchAgent = async () => {
      try {
        const data = await apiService.getAgentDetail(agentId)
        setAgent(data)
      } catch {
        setError('Failed to load agent')
      } finally {
        setLoading(false)
      }
    }
    fetchAgent()
  }, [agentId])

  useEffect(() => {
    if (activeTab === 'history' || activeTab === 'commands') {
      apiService.getAgentHistory(agentId)
        .then(setCommands)
        .catch(() => setError('Failed to load commands'))
    }
  }, [agentId, activeTab])

  const sendCommand = async () => {
    if (!cmdInput.trim()) return
    setSending(true)
    try {
      await apiService.sendAgentCommand(agentId, cmdInput, cmdShell)
      setCmdInput('')
      const hist = await apiService.getAgentHistory(agentId)
      setCommands(hist)
    } catch {
      setError('Failed to send command')
    } finally {
      setSending(false)
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'offline': return 'bg-gray-500'
      case 'overdue': return 'bg-yellow-500'
      default: return 'bg-red-500'
    }
  }

  const cmdStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-600',
      running: 'bg-blue-500/10 text-blue-600',
      completed: 'bg-green-500/10 text-green-600',
      failed: 'bg-red-500/10 text-red-600',
      timeout: 'bg-orange-500/10 text-orange-600',
    }
    return colors[status] || 'bg-gray-500/10 text-gray-600'
  }

  if (loading) {
    return <div className="p-6 text-gray-400">Loading agent...</div>
  }

  if (!agent) {
    return <div className="p-6 text-red-400">{error || 'Agent not found'}</div>
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'commands', label: 'Commands' },
    { key: 'history', label: 'History' },
    { key: 'services', label: 'Services' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="text-gray-400 hover:text-gray-200 text-sm">← Back</button>
        )}
        <div className={`w-3 h-3 rounded-full ${statusColor(agent.status)}`} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{agent.hostname}</h1>
        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
          {agent.plat} / {agent.goarch}
        </span>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-blue-500 border-b-2 border-blue-500'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">System Info</h3>
            <div className="space-y-2 text-sm">
              {[
                ['OS', `${agent.os_name} ${agent.os_version}`],
                ['CPU', `${agent.cpu_model} (${agent.cpu_cores} cores)`],
                ['RAM', `${(agent.total_ram / 1024 / 1024 / 1024).toFixed(1)} GB`],
                ['Logged In', agent.logged_in_user || 'None'],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{label}</span>
                  <span className="text-gray-900 dark:text-white font-mono text-xs">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Network</h3>
            <div className="space-y-2 text-sm">
              {[
                ['Public IP', agent.public_ip],
                ['Local IP', agent.local_ip],
                ['Agent ID', agent.agent_id],
                ['Version', agent.version || 'N/A'],
                ['Last Seen', agent.last_seen ? new Date(agent.last_seen).toLocaleString() : 'Never'],
                ['First Seen', agent.first_seen ? new Date(agent.first_seen).toLocaleString() : 'N/A'],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{label}</span>
                  <span className="text-gray-900 dark:text-white font-mono text-xs">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Commands Tab */}
      {activeTab === 'commands' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Send Command</h3>
            <div className="flex gap-2">
              <select
                value={cmdShell}
                onChange={e => setCmdShell(e.target.value as any)}
                className="px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
              >
                <option value="powershell">PowerShell</option>
                <option value="bash">Bash</option>
                <option value="python">Python</option>
              </select>
              <input
                type="text"
                value={cmdInput}
                onChange={e => setCmdInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendCommand()}
                placeholder="Enter command..."
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white font-mono"
              />
              <button
                onClick={sendCommand}
                disabled={sending || !cmdInput.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Run'}
              </button>
            </div>
          </div>

          {/* Recent commands */}
          <div className="space-y-2">
            {commands.slice(0, 10).map(cmd => (
              <div key={cmd.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-2">
                  <code className="text-xs text-gray-300 font-mono">{cmd.command}</code>
                  <span className={`text-xs px-2 py-0.5 rounded ${cmdStatusBadge(cmd.status)}`}>
                    {cmd.status}
                  </span>
                </div>
                {cmd.output && (
                  <pre className="text-xs text-green-400 bg-gray-950 rounded p-3 mt-2 max-h-32 overflow-auto">
                    {cmd.output}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {commands.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No command history</p>
          ) : (
            commands.map(cmd => (
              <div key={cmd.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-gray-300 font-mono">{cmd.command}</code>
                    <span className="text-xs text-gray-500">{cmd.shell}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{cmd.run_by}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${cmdStatusBadge(cmd.status)}`}>
                      {cmd.status}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(cmd.created_at).toLocaleString()}
                  {cmd.completed_at && ` → ${new Date(cmd.completed_at).toLocaleString()}`}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Services</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Service monitoring will be available once the agent checks in with service data.
          </p>
        </div>
      )}
    </div>
  )
}

export default AgentDetail