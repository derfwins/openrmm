import { useState, useEffect } from 'react'
import apiService from '../services/apiService'

type Platform = 'windows' | 'linux' | 'macos'
type Step = 'platform' | 'config' | 'install' | 'verify'

interface Client {
  id: number
  name: string
  sites: Array<{ id: number; name: string; client: number }>
}

const AgentDeployment = () => {
  const [step, setStep] = useState<Step>('platform')
  const [platform, setPlatform] = useState<Platform>('windows')
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<number | null>(null)
  const [selectedSite, setSelectedSite] = useState<number | null>(null)
  const [agentType, setAgentType] = useState<'server' | 'workstation'>('server')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<Array<{ id: string; hostname: string; first_seen: string }>>([])
  const [verifying, setVerifying] = useState(false)
  const [agentFound, setAgentFound] = useState(false)

  const serverUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : `${window.location.protocol}//${window.location.host}`

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [clientsData, agentsData] = await Promise.allSettled([
        apiService.getClients(),
        apiService.getDevices(),
      ])
      if (clientsData.status === 'fulfilled') {
        const c = clientsData.value
        setClients(Array.isArray(c) ? c : c.results || [])
      }
      if (agentsData.status === 'fulfilled') {
        const a = agentsData.value
        const agentList = Array.isArray(a) ? a : a.results || []
        setAgents(agentList.sort((x: Record<string, unknown>, y: Record<string, unknown>) =>
          String(y.first_seen || '').localeCompare(String(x.first_seen || ''))
        ).slice(0, 5).map((ag: Record<string, unknown>) => ({
          id: String(ag.id || ag.agent_id || ''),
          hostname: String(ag.hostname || ag.name || 'Unknown'),
          first_seen: String(ag.first_seen || ag.last_seen || ''),
        })))
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }

  const availableSites = clients.find(c => c.id === selectedClient)?.sites || []

  const getInstallCommand = () => {
    const clientName = clients.find(c => c.id === selectedClient)?.name || ''
    const siteName = availableSites.find(s => s.id === selectedSite)?.name || ''
    const typeFlag = agentType === 'server' ? 'server' : 'workstation'

    if (platform === 'windows') {
      return `powershell -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '${serverUrl}/api/agents/installers/install-windows.ps1' -OutFile 'install.ps1'; ./install.ps1 -server '${serverUrl}' -client '${clientName}' -site '${siteName}' -type '${typeFlag}'"`
    }
    const shell = platform === 'macos' ? 'install-macos.sh' : 'install-linux.sh'
    return `curl -sSL ${serverUrl}/api/agents/installers/${shell} | bash -s -- -server '${serverUrl}' -client '${clientName}' -site '${siteName}' -type '${typeFlag}'`
  }

  const copyCommand = () => {
    navigator.clipboard.writeText(getInstallCommand())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const startVerification = () => {
    setVerifying(true)
    setAgentFound(false)
    const initialCount = agents.length
    const check = setInterval(async () => {
      try {
        const data = await apiService.getDevices()
        const agentList = Array.isArray(data) ? data : data.results || []
        if (agentList.length > initialCount) {
          setAgentFound(true)
          setVerifying(false)
          clearInterval(check)
          loadData()
        }
      } catch {
        // Keep trying
      }
    }, 5000)
    setTimeout(() => {
      clearInterval(check)
      setVerifying(false)
    }, 120000)
  }

  const platformInfo = {
    windows: { icon: '🪟', label: 'Windows', ext: 'ps1', shell: 'PowerShell' },
    linux: { icon: '🐧', label: 'Linux', ext: 'sh', shell: 'Bash' },
    macos: { icon: '🍎', label: 'macOS', ext: 'sh', shell: 'Bash' },
  }

  const steps: Array<{ id: Step; label: string }> = [
    { id: 'platform', label: 'Platform' },
    { id: 'config', label: 'Configure' },
    { id: 'install', label: 'Install' },
    { id: 'verify', label: 'Verify' },
  ]

  const currentStepIndex = steps.findIndex(s => s.id === step)

  if (loading) {
    return (
      <div className="p-6 bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">📥 Deploy Agent</h1>
        <p className="text-gray-400 text-sm mb-6">Install the OpenRMM agent on a new device</p>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                i < currentStepIndex ? 'bg-green-600 text-white' :
                i === currentStepIndex ? 'bg-blue-600 text-white' :
                'bg-gray-700 text-gray-400'
              }`}>
                {i < currentStepIndex ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${i === currentStepIndex ? 'text-white' : 'text-gray-500'}`}>{s.label}</span>
              {i < steps.length - 1 && <div className="w-12 h-0.5 bg-gray-700" />}
            </div>
          ))}
        </div>

        {/* Step 1: Platform */}
        {step === 'platform' && (
          <div className="grid grid-cols-3 gap-4">
            {(Object.keys(platformInfo) as Platform[]).map(p => (
              <button
                key={p}
                onClick={() => { setPlatform(p); setStep('config') }}
                className={`p-6 rounded-xl border-2 transition-all text-center ${
                  platform === p ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="text-4xl mb-3">{platformInfo[p].icon}</div>
                <div className="text-white font-medium">{platformInfo[p].label}</div>
                <div className="text-gray-400 text-xs mt-1">{platformInfo[p].shell} installer</div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Configuration */}
        {step === 'config' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-5">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Client</label>
              <select
                value={selectedClient || ''}
                onChange={e => { setSelectedClient(Number(e.target.value) || null); setSelectedSite(null) }}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg border border-gray-600 text-sm"
              >
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Site</label>
              <select
                value={selectedSite || ''}
                onChange={e => setSelectedSite(Number(e.target.value) || null)}
                className="w-full bg-gray-700 text-white px-3 py-2.5 rounded-lg border border-gray-600 text-sm"
                disabled={!selectedClient}
              >
                <option value="">Select site...</option>
                {availableSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Agent Type</label>
              <div className="flex gap-3">
                {(['server', 'workstation'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setAgentType(t)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                      agentType === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {t === 'server' ? '🖥️ Server' : '💼 Workstation'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep('platform')} className="px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600">← Back</button>
              <button
                onClick={() => setStep('install')}
                disabled={!selectedClient || !selectedSite}
                className="px-6 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Generate Command →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Install Command */}
        {step === 'install' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-300">Run this command on the target {platformInfo[platform].label} device:</span>
                <button onClick={copyCommand} className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300">
                  {copied ? '✅ Copied!' : '📋 Copy'}
                </button>
              </div>
              <pre className="bg-gray-950 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {getInstallCommand()}
              </pre>
            </div>

            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-white font-medium text-sm mb-3">📖 Instructions</h3>
              {platform === 'windows' ? (
                <ol className="text-gray-400 text-xs space-y-1.5 list-decimal list-inside">
                  <li>Open PowerShell as Administrator</li>
                  <li>Paste the command above and press Enter</li>
                  <li>Wait for the agent to install and register</li>
                  <li>The agent will appear in your device list automatically</li>
                </ol>
              ) : (
                <ol className="text-gray-400 text-xs space-y-1.5 list-decimal list-inside">
                  <li>Open a terminal on the target device</li>
                  <li>Paste the command above and press Enter</li>
                  <li>Wait for the agent to install and register</li>
                  <li>The agent will appear in your device list automatically</li>
                </ol>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('config')} className="px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600">← Back</button>
              <button onClick={() => { setStep('verify'); startVerification() }} className="px-6 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                I've Run the Command →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Verification */}
        {step === 'verify' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
              {agentFound ? (
                <>
                  <div className="text-5xl mb-4">🎉</div>
                  <h3 className="text-xl font-bold text-white mb-2">Agent Connected!</h3>
                  <p className="text-gray-400 text-sm">The new agent has checked in and is now visible in your device list.</p>
                  <button onClick={() => { setStep('platform'); setAgentFound(false) }} className="mt-4 px-6 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                    Deploy Another Agent
                  </button>
                </>
              ) : verifying ? (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Waiting for agent to check in...</h3>
                  <p className="text-gray-400 text-sm">This usually takes 30-60 seconds after the installer completes.</p>
                  <p className="text-gray-500 text-xs mt-2">Checking every 5 seconds (up to 2 minutes)</p>
                </>
              ) : (
                <>
                  <div className="text-5xl mb-4">⏳</div>
                  <h3 className="text-lg font-medium text-white mb-2">No new agent detected yet</h3>
                  <p className="text-gray-400 text-sm">Make sure the install command ran successfully on the target device.</p>
                  <div className="flex gap-3 justify-center mt-4">
                    <button onClick={startVerification} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Retry</button>
                    <button onClick={() => setStep('install')} className="px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600">View Command</button>
                  </div>
                </>
              )}
            </div>

            {/* Troubleshooting */}
            <details className="bg-gray-800 rounded-xl border border-gray-700">
              <summary className="px-5 py-3 text-sm text-gray-300 cursor-pointer hover:text-white">🔧 Troubleshooting</summary>
              <div className="px-5 pb-4 text-gray-400 text-xs space-y-2">
                <p><strong className="text-gray-300">Command fails on Windows:</strong> Make sure PowerShell is running as Administrator</p>
                <p><strong className="text-gray-300">Command fails on Linux:</strong> Run with sudo or as root</p>
                <p><strong className="text-gray-300">Agent doesn't appear:</strong> Check firewall allows outbound connections to {serverUrl}</p>
                <p><strong className="text-gray-300">Connection refused:</strong> Verify the server is accessible from the target device</p>
              </div>
            </details>
          </div>
        )}

        {/* Recently Enrolled */}
        {agents.length > 0 && (
          <div className="mt-8 bg-gray-800 rounded-xl border border-gray-700 p-5">
            <h3 className="text-white font-medium text-sm mb-3">🕐 Recently Enrolled</h3>
            <table className="w-full">
              <thead>
                <tr className="text-gray-400 text-xs">
                  <th className="text-left py-2">Hostname</th>
                  <th className="text-left py-2">Enrolled</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a.id} className="border-t border-gray-700">
                    <td className="py-2 text-white text-sm">{a.hostname}</td>
                    <td className="py-2 text-gray-400 text-xs">{a.first_seen ? new Date(a.first_seen).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default AgentDeployment