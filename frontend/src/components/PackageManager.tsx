import { useState, useEffect, useCallback, useRef } from 'react'
import apiService from '../services/apiService'

type PackageManager = 'winget' | 'chocolatey'

interface Package {
  name: string
  id: string
  version: string
  source: string
  manager: PackageManager
}

interface Device {
  id: string
  hostname: string
  operating_system?: string
  status?: string
}

const PackageManager = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchManager, setSearchManager] = useState<PackageManager>('winget')
  const [searchResults, setSearchResults] = useState<Package[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Installed packages
  const [installedPackages, setInstalledPackages] = useState<Package[]>([])
  const [installedLoading, setInstalledLoading] = useState(false)
  const [showInstalled, setShowInstalled] = useState(false)

  // Install/Uninstall
  const [installing, setInstalling] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [actionOutput, setActionOutput] = useState<{ pkg: string; output: string; success: boolean } | null>(null)
  const [installArgs, setInstallArgs] = useState('')
  const [showArgsModal, setShowArgsModal] = useState<string | null>(null)

  // Load devices
  const loadDevices = useCallback(async () => {
    try {
      const data = await apiService.getDevices()
      const devList = Array.isArray(data) ? data : data.results || []
      setDevices(devList.map((d: Record<string, unknown>) => ({
        id: (d.id as string || d.agent_id as string || ''),
        hostname: (d.hostname || d.computer_name || d.name || 'Unknown') as string,
        operating_system: (d.operating_system || d.os || '') as string,
        status: (d.status || 'offline') as string,
      })))
      // Auto-select first online agent
      const online = devList.filter(d => d.status === 'online' || d.status === 'Online')
      if (online.length > 0) setSelectedAgent(String(online[0].id || online[0].agent_id || ''))
    } catch {
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDevices() }, [loadDevices])

  // Search packages on selected agent
  const handleSearch = useCallback(async () => {
    if (!selectedAgent || !searchQuery.trim()) return
    setSearchLoading(true)
    setSearchError('')
    setSearchResults([])
    try {
      const result = await apiService.searchPackages(selectedAgent, searchQuery.trim(), searchManager)
      if (result.packages?.length) {
        setSearchResults(result.packages)
      } else if (result.raw_output) {
        setSearchError(result.raw_output)
      } else {
        setSearchError('No packages found')
      }
    } catch (e: any) {
      setSearchError(e.message || 'Search failed')
    } finally {
      setSearchLoading(false)
    }
  }, [selectedAgent, searchQuery, searchManager])

  // List installed packages
  const handleListInstalled = useCallback(async () => {
    if (!selectedAgent) return
    setInstalledLoading(true)
    setShowInstalled(true)
    try {
      const result = await apiService.listPackages(selectedAgent, searchManager)
      if (result.output) {
        // Parse winget list output into structured data
        const lines = result.output.split('\n')
        const packages: Package[] = []
        let headerPassed = false
        for (const line of lines) {
          if (!headerPassed) {
            if (line.includes('---')) headerPassed = true
            continue
          }
          const trimmed = line.trim()
          if (!trimmed) continue
          // Parse the table - name can have spaces, but id usually has dots
          const parts = trimmed.split(/\s{2,}/) // split on 2+ spaces
          if (parts.length >= 2) {
            packages.push({
              name: parts[0] || '',
              id: parts[1] || parts[0],
              version: parts[2] || '',
              source: parts[3] || searchManager,
              manager: searchManager,
            })
          }
        }
        setInstalledPackages(packages)
      }
    } catch (e: any) {
      setSearchError(e.message || 'Failed to list packages')
    } finally {
      setInstalledLoading(false)
    }
  }, [selectedAgent, searchManager])

  // Install package
  const handleInstall = useCallback(async (pkg: Package, args: string = '') => {
    if (!selectedAgent) return
    setInstalling(pkg.id)
    setActionOutput(null)
    try {
      const result = await apiService.installPackage(selectedAgent, pkg.id, pkg.manager, args)
      setActionOutput({
        pkg: pkg.id,
        success: true,
        output: `📦 Install queued on ${devices.find(d => d.id === selectedAgent)?.hostname || selectedAgent}\nSession: ${result.session_id || 'pending'}\n\nThe agent will download and install the package. Check back in a few minutes.`,
      })
    } catch (e: any) {
      setActionOutput({ pkg: pkg.id, success: false, output: `❌ Failed: ${e.message}` })
    } finally {
      setInstalling(null)
      setShowArgsModal(null)
    }
  }, [selectedAgent, devices])

  // Uninstall package
  const handleUninstall = useCallback(async (pkg: Package) => {
    if (!selectedAgent) return
    setUninstalling(pkg.id)
    setActionOutput(null)
    try {
      const result = await apiService.uninstallPackage(selectedAgent, pkg.id, pkg.manager)
      setActionOutput({
        pkg: pkg.id,
        success: true,
        output: `🗑️ Uninstall queued on ${devices.find(d => d.id === selectedAgent)?.hostname || selectedAgent}\nSession: ${result.session_id || 'pending'}`,
      })
    } catch (e: any) {
      setActionOutput({ pkg: pkg.id, success: false, output: `❌ Failed: ${e.message}` })
    } finally {
      setUninstalling(null)
    }
  }, [selectedAgent, devices])

  // Handle Enter key in search
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  if (loading) {
    return <div className="p-6 bg-gray-900 min-h-screen text-gray-400">Loading devices...</div>
  }

  const onlineDevices = devices.filter(d => d.status === 'online' || d.status === 'Online')
  const selectedDevice = devices.find(d => d.id === selectedAgent)

  return (
    <div className="p-6 bg-gray-900 min-h-screen space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📦 Software Manager</h1>
          <p className="text-sm text-gray-400 mt-1">Search, install, and manage software packages via winget & Chocolatey</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={searchManager}
            onChange={e => setSearchManager(e.target.value as PackageManager)}
            className="bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="winget">🪟 Winget</option>
            <option value="chocolatey">🍫 Chocolatey</option>
          </select>
        </div>
      </div>

      {/* Agent Selector */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">Target Agent</label>
        <div className="flex items-center gap-3">
          <select
            value={selectedAgent}
            onChange={e => { setSelectedAgent(e.target.value); setSearchResults([]); setInstalledPackages([]); setActionOutput(null) }}
            className="flex-1 bg-gray-900 text-gray-200 border border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">Select an agent...</option>
            {onlineDevices.map(d => (
              <option key={d.id} value={d.id}>
                🟢 {d.hostname} {d.operating_system ? `(${d.operating_system})` : ''}
              </option>
            ))}
            {devices.filter(d => d.status !== 'online' && d.status !== 'Online').map(d => (
              <option key={d.id} value={d.id} disabled>
                🔴 {d.hostname} (offline)
              </option>
            ))}
          </select>
          <button
            onClick={handleListInstalled}
            disabled={!selectedAgent || installedLoading}
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors whitespace-nowrap"
          >
            {installedLoading ? 'Loading...' : '📋 List Installed'}
          </button>
        </div>
        {selectedAgent && (
          <p className="text-xs text-gray-500 mt-2">
            Packages will be installed on <span className="text-gray-300">{selectedDevice?.hostname || selectedAgent}</span>
          </p>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={`Search ${searchManager} packages... (e.g. Firefox, Chrome, 7zip)`}
              className="w-full bg-gray-900 text-gray-200 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!selectedAgent || searchLoading || !searchQuery.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {searchLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                Searching...
              </span>
            ) : 'Search'}
          </button>
        </div>

        {/* Popular quick-search chips */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-gray-500">Popular:</span>
          {['Firefox', 'Chrome', '7zip', 'Notepad++', 'VSCode', 'VLC'].map(q => (
            <button
              key={q}
              onClick={() => { setSearchQuery(q); setSearchResults([]) }}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-md transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Search Error */}
      {searchError && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <p className="text-sm text-gray-400 whitespace-pre-wrap">{searchError}</p>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            🔍 Search Results
            <span className="text-sm font-normal text-gray-400">({searchResults.length} packages)</span>
          </h2>
          <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
            {searchResults.map(pkg => (
              <div key={pkg.id} className="flex items-center justify-between p-4 hover:bg-gray-750 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm truncate">{pkg.name}</span>
                    {pkg.version && (
                      <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">{pkg.version}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{pkg.id} · {pkg.source}</p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleInstall(pkg)}
                    disabled={installing === pkg.id || !selectedAgent}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-md transition-colors"
                  >
                    {installing === pkg.id ? 'Installing...' : '⬇ Install'}
                  </button>
                  <button
                    onClick={() => setShowArgsModal(pkg.id)}
                    className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-md transition-colors"
                    title="Install with custom arguments"
                  >
                    ⚙️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Installed Packages */}
      {showInstalled && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📋 Installed Packages
            {installedLoading && <span className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />}
            <span className="text-sm font-normal text-gray-400">({installedPackages.length} packages)</span>
          </h2>
          {installedLoading ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-400">
              Loading installed packages...
            </div>
          ) : installedPackages.length > 0 ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
              {installedPackages.map((pkg, i) => (
                <div key={`${pkg.id}-${i}`} className="flex items-center justify-between p-3 hover:bg-gray-750 transition-colors">
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm truncate">{pkg.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{pkg.version}</span>
                  </div>
                  <button
                    onClick={() => handleUninstall(pkg)}
                    disabled={uninstalling === pkg.id || !selectedAgent}
                    className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded-md transition-colors disabled:opacity-50"
                  >
                    {uninstalling === pkg.id ? 'Removing...' : '🗑️'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-gray-400 text-sm">
              No installed packages found
            </div>
          )}
        </div>
      )}

      {/* Action Output */}
      {actionOutput && (
        <div className={`bg-gray-800 rounded-lg border p-4 ${actionOutput.success ? 'border-green-700' : 'border-red-700'}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white">Action Result: {actionOutput.pkg}</h3>
            <button onClick={() => setActionOutput(null)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          </div>
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono bg-gray-900 rounded p-3 overflow-x-auto">{actionOutput.output}</pre>
        </div>
      )}

      {/* Custom Install Args Modal */}
      {showArgsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowArgsModal(null)}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-gray-800 rounded-xl shadow-2xl border border-gray-700 max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-2">⚙️ Custom Install Arguments</h3>
            <p className="text-sm text-gray-400 mb-4">Package: <span className="text-gray-200">{showArgsModal}</span></p>
            <input
              value={installArgs}
              onChange={e => setInstallArgs(e.target.value)}
              placeholder="e.g. --override /S /D=C:\CustomPath"
              className="w-full bg-gray-900 text-gray-200 border border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowArgsModal(null)} className="px-4 py-2 text-gray-400 hover:text-gray-200 text-sm">Cancel</button>
              <button
                onClick={() => {
                  const pkg = searchResults.find(p => p.id === showArgsModal)
                  if (pkg) handleInstall(pkg, installArgs)
                  setInstallArgs('')
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg"
              >
                Install
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PackageManager