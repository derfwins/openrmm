import { API_BASE_URL } from '../config'
import { useState, useEffect } from 'react'

interface Site {
  id: number
  name: string
  client: number
  client_name: string
  agent_count?: number
}

interface Client {
  id: number
  name: string
  sites: Site[]
}

const InstallAgent = () => {
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<number | null>(null)
  const [selectedSite, setSelectedSite] = useState<number | null>(null)
  const [availableSites, setAvailableSites] = useState<Site[]>([])
  const [installScript, setInstallScript] = useState('')
  const [platform, setPlatform] = useState<'windows' | 'linux'>('windows')
  const [agentType, setAgentType] = useState<'server' | 'workstation'>('server')
  const [copied, setCopied] = useState(false)
  const [fetchingClients, setFetchingClients] = useState(true)
  const [error, setError] = useState('')

  const token = localStorage.getItem('token')
  const apiUrl = window.location.hostname === 'localhost'
    ? 'http://10.10.0.122:8000'
    : `${window.location.protocol}//${window.location.hostname}:8000`

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const resp = await fetch(`${apiUrl}/clients/`, { headers })
        const data = await resp.json()
        setClients(data)
        if (data.length > 0) {
          setSelectedClient(data[0].id)
          const sites = data[0].sites || data[0].filtered_sites || []
          setAvailableSites(sites)
          if (sites.length > 0) setSelectedSite(sites[0].id)
        }
      } catch {
        setError('Failed to load clients')
      } finally {
        setFetchingClients(false)
      }
    }
    fetchClients()
  }, [])

  useEffect(() => {
    if (!selectedClient) return
    const client = clients.find(c => c.id === selectedClient)
    if (client) {
      const sites = client.sites || client.filtered_sites || []
      setAvailableSites(sites)
      setSelectedSite(sites.length > 0 ? sites[0].id : null)
    }
  }, [selectedClient, clients])

  const generateScript = async () => {
    if (!selectedClient || !selectedSite) {
      setError('Please select a client and site')
      return
    }
    setLoading(true)
    setError('')
    try {
      const body = {
        plat: platform,
        goarch: 'amd64',
        client: selectedClient,
        site: selectedSite,
        expires: 24,
        installMethod: platform === 'windows' ? 'powershell' : 'bash',
        api: apiUrl,
        agenttype: agentType,
        power: 1,
        rdp: 1,
        ping: 1,
        fileName: platform === 'windows'
          ? 'tacticalagent-v2.10.0-windows-amd64.exe'
          : 'tacticalagent-v2.10.0-linux-amd64',
      }

      const resp = await fetch(`${apiUrl}/agents/installer/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!resp.ok) {
        const text = await resp.text()
        // Try to extract error from HTML or JSON
        const match = text.match(/Exception Value:?\s*(.+)/)
        setError(match ? match[1].trim() : 'Failed to generate install script')
        setLoading(false)
        return
      }

      // The powershell method returns text/plain, bash returns JSON with .cmd
      const contentType = resp.headers.get('content-type') || ''
      if (contentType.includes('text/plain')) {
        const text = await resp.text()
        setInstallScript(text)
      } else {
        const data = await resp.json()
        setInstallScript(data.cmd || data.ps || JSON.stringify(data))
      }
    } catch (err) {
      setError('Failed to generate install script')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Install Agent</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Generate an install script to deploy the Tactical RMM agent on your devices</p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Configuration</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client</label>
            <select
              value={selectedClient || ''}
              onChange={e => setSelectedClient(Number(e.target.value))}
              disabled={fetchingClients || clients.length === 0}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white disabled:opacity-50"
            >
              {clients.length === 0 && <option value="">No clients</option>}
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Site */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site</label>
            <select
              value={selectedSite || ''}
              onChange={e => setSelectedSite(Number(e.target.value))}
              disabled={!selectedClient || availableSites.length === 0}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white disabled:opacity-50"
            >
              {availableSites.length === 0 && <option value="">No sites</option>}
              {availableSites.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

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
        </div>

        <button
          onClick={generateScript}
          disabled={loading || !selectedClient || !selectedSite}
          className="px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Generating...' : 'Generate Install Script'}
        </button>
      </div>

      {/* Generated Script */}
      {installScript && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {platform === 'windows' ? 'PowerShell' : 'Bash'} Install Script
            </h2>
            <button
              onClick={() => copyToClipboard(installScript)}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5"
            >
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
          <pre className="p-5 bg-gray-950 text-green-400 text-xs font-mono overflow-x-auto max-h-96 leading-relaxed whitespace-pre-wrap">
            {installScript}
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
            ⚠️ The target machine must be able to reach <code className="px-1 bg-yellow-500/10 rounded">{apiUrl.replace('https://', '').replace('http://', '')}</code> (the RMM server). For production, use HTTPS and configure proper DNS.
          </p>
        </div>
      </div>
    </div>
  )
}

export default InstallAgent