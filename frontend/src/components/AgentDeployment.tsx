import { useState } from 'react'
// apiService import removed - not used

type Platform = 'windows' | 'linux' | 'macos'

const AgentDeployment = () => {
  const [platform, setPlatform] = useState<Platform>('windows')
  const [client, setClient] = useState('')
  const [site, setSite] = useState('')
  const [agentType, setAgentType] = useState<'server' | 'workstation'>('server')
  const [installCmd, setInstallCmd] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const serverUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : `${window.location.protocol}//${window.location.hostname}:8000`

  const generateCommand = () => {
    const scriptExt = platform === 'windows' ? 'ps1' : 'sh'
    const scriptName = `install-${platform}.${scriptExt}`

    if (platform === 'windows') {
      return `Invoke-WebRequest -Uri "${serverUrl}/api/agents/installers/${scriptName}" -OutFile "${scriptName}"; ` +
        `powershell -ExecutionPolicy Bypass -File ./${scriptName} ` +
        `-ServerUrl "${serverUrl}" -Client "${client}" -Site "${site}" -AgentType "${agentType}"`
    } else {
      return `curl -sO "${serverUrl}/api/agents/installers/${scriptName}" && ` +
        `sudo bash ${scriptName} "${serverUrl}" "${client}" "${site}" "${agentType}"`
    }
  }

  const handleGenerate = () => {
    if (!client || !site) return
    setLoading(true)
    setInstallCmd(generateCommand())
    setLoading(false)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const platformIcon: Record<Platform, string> = {
    windows: '🪟',
    linux: '🐧',
    macos: '🍎',
  }

  const platformLabel: Record<Platform, string> = {
    windows: 'Windows',
    linux: 'Linux',
    macos: 'macOS',
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agent Deployment</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Generate install commands to deploy OpenRMM agents on your devices
        </p>
      </div>

      {/* Platform Selection */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Select Platform</h2>
        <div className="grid grid-cols-3 gap-3">
          {(['windows', 'linux', 'macos'] as Platform[]).map(p => (
            <button
              key={p}
              onClick={() => { setPlatform(p); setInstallCmd('') }}
              className={`p-4 rounded-lg border-2 transition-all text-center ${
                platform === p
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span className="text-2xl block">{platformIcon[p]}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white mt-1 block">
                {platformLabel[p]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client ID</label>
            <input
              type="text"
              value={client}
              onChange={e => setClient(e.target.value)}
              placeholder="e.g. 1"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site ID</label>
            <input
              type="text"
              value={site}
              onChange={e => setSite(e.target.value)}
              placeholder="e.g. 1"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Type</label>
            <select
              value={agentType}
              onChange={e => setAgentType(e.target.value as 'server' | 'workstation')}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
            >
              <option value="server">Server</option>
              <option value="workstation">Workstation</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading || !client || !site}
          className="px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Generating...' : 'Generate Install Command'}
        </button>
      </div>

      {/* Generated Command */}
      {installCmd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {platformIcon[platform]} {platformLabel[platform]} Install Command
            </h2>
            <button
              onClick={() => copyToClipboard(installCmd)}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
          <pre className="p-5 bg-gray-950 text-green-400 text-xs font-mono overflow-x-auto max-h-40 leading-relaxed whitespace-pre-wrap">
            {installCmd}
          </pre>
        </div>
      )}

      {/* Quick Install Instructions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Install</h2>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          {platform === 'windows' ? (
            <>
              <p>1. Open <strong className="text-gray-900 dark:text-white">PowerShell as Administrator</strong></p>
              <p>2. Copy and paste the command above</p>
              <p>3. The agent will download, install, and enroll automatically</p>
            </>
          ) : platform === 'macos' ? (
            <>
              <p>1. Open <strong className="text-gray-900 dark:text-white">Terminal</strong></p>
              <p>2. Run: <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">sudo bash</code></p>
              <p>3. Paste the command and press Enter</p>
            </>
          ) : (
            <>
              <p>1. SSH into the target machine as <strong className="text-gray-900 dark:text-white">root</strong></p>
              <p>2. Paste the command and press Enter</p>
              <p>3. The agent will install as a systemd service</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AgentDeployment