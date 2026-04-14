import { useState } from 'react'
import apiService from '../services/apiService'

const InstallAgent = () => {
  const [loading, setLoading] = useState(false)
  const [installScript, setInstallScript] = useState<{ cmd: string; ps: string } | null>(null)
  const [platform, setPlatform] = useState<'windows' | 'linux'>('windows')
  const [client, setClient] = useState('1')
  const [site, setSite] = useState('1')
  const [agentType, setAgentType] = useState<'server' | 'workstation'>('server')
  const [copied, setCopied] = useState(false)

  const generateScript = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const rmmServer = window.location.hostname === 'localhost'
        ? 'http://10.10.0.122:8000'
        : `${window.location.protocol}//${window.location.hostname}:8000`

      const body = {
        plat: platform,
        goarch: 'amd64',
        client: parseInt(client),
        site: parseInt(site),
        expires: 24,
        installMethod: platform === 'windows' ? 'powershell' : 'bash',
        api: rmmServer,
        agenttype: agentType,
        power: 1,
        rdp: 1,
        ping: 1,
        fileName: platform === 'windows'
          ? 'tacticalagent-v2.10.0-windows-amd64.exe'
          : 'tacticalagent-v2.10.0-linux-amd64',
      }

      const response = await fetch(`${rmmServer}/agents/installer/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      setInstallScript({ cmd: data.cmd || data.ps || '', ps: data.ps || '' })
    } catch (err) {
      console.error('Failed to generate install script:', err)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const scriptContent = installScript?.ps || installScript?.cmd || ''

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Install Agent</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Generate an install script to deploy the Tactical RMM agent on your devices</p>
      </div>

      {/* Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Configuration</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Platform</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value as any)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
            >
              <option value="windows">🪟 Windows</option>
              <option value="linux">🐧 Linux</option>
            </select>
          </div>

          {/* Agent Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Type</label>
            <select
              value={agentType}
              onChange={e => setAgentType(e.target.value as any)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
            >
              <option value="server">Server</option>
              <option value="workstation">Workstation</option>
            </select>
          </div>

          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client ID</label>
            <input
              type="number"
              value={client}
              onChange={e => setClient(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
            />
          </div>

          {/* Site */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site ID</label>
            <input
              type="number"
              value={site}
              onChange={e => setSite(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
            />
          </div>
        </div>

        <button
          onClick={generateScript}
          disabled={loading}
          className="px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Generating...' : 'Generate Install Script'}
        </button>
      </div>

      {/* Generated Script */}
      {scriptContent && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {platform === 'windows' ? 'PowerShell' : 'Bash'} Install Script
            </h2>
            <button
              onClick={() => copyToClipboard(scriptContent)}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5"
            >
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
          <pre className="p-5 bg-gray-950 text-green-400 text-xs font-mono overflow-x-auto max-h-96 leading-relaxed">
            {scriptContent}
          </pre>
        </div>
      )}

      {/* Quick Instructions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">How to install</h2>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          {platform === 'windows' ? (
            <>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">1.</span>
                <span>Open <strong className="text-gray-900 dark:text-white">PowerShell as Administrator</strong> on the target Windows machine</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">2.</span>
                <span>Copy the generated script above and paste it into the PowerShell window</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">3.</span>
                <span>Press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">Enter</kbd> to run — the agent will download, install, and register automatically</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">4.</span>
                <span>The device will appear in the <strong className="text-gray-900 dark:text-white">Devices</strong> list within 30 seconds</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">1.</span>
                <span>SSH into the target Linux machine as <strong className="text-gray-900 dark:text-white">root</strong> (or use sudo)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">2.</span>
                <span>Copy the generated script, paste it into the terminal, and run it</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-bold shrink-0">3.</span>
                <span>The agent will download, install, and register automatically</span>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            ⚠️ The target machine must be able to reach <code className="px-1 bg-yellow-500/10 rounded">10.10.0.122:8000</code> (the RMM server). For production deployments, use HTTPS and configure proper DNS.
          </p>
        </div>
      </div>
    </div>
  )
}

export default InstallAgent