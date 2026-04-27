import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import apiService from '../services/apiService'
import Terminal from './Terminal'
import { IconMonitor, IconTerminal as IconTerminalSVG, IconRefresh, IconTrash, IconSearch, IconWindows, IconLinux, IconApple, IconChevronRight, IconInfo, IconPower, IconWrench, IconSettings, IconCpu, IconZap, IconUserIcon } from './Icons'
import RemoteDesktop from './RemoteDesktop'
import { useEscapeKey } from '../hooks/useEscapeKey'

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [agent, setAgent] = useState<any>(null)

  // Agent is "active" (reachable) if online or overdue (recently heartbeated)
  const isActive = agent?.status === 'online' || agent?.status === 'overdue' || agent?.status === 'warning'
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'checks' | 'scripts' | 'events' | 'services' | 'software'>('overview')
  const [commandInput, setCommandInput] = useState('')
  const [commandOutput, setCommandOutput] = useState<string | null>(null)
  const [commandRunning, setCommandRunning] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [showDesktop, setShowDesktop] = useState(false)
  const [token] = useState(() => localStorage.getItem('token') || '')
  const [serviceFilter, setServiceFilter] = useState('')
  const [serviceActionLoading, setServiceActionLoading] = useState<string | null>(null)

  // Software tab state
  const [pkgManager, setPkgManager] = useState<'winget' | 'chocolatey'>('chocolatey')
  const [pkgSearchQuery, setPkgSearchQuery] = useState('')
  const [pkgSearchResults, setPkgSearchResults] = useState<any[]>([])
  const [pkgSearchLoading, setPkgSearchLoading] = useState(false)
  const [pkgSearchError, setPkgSearchError] = useState('')
  const [pkgInstalled, setPkgInstalled] = useState<any[]>([])
  const [pkgInstalledLoading, setPkgInstalledLoading] = useState(false)
  const [chocoInstalling, setChocoInstalling] = useState(false)
  const [chocoInstallOutput, setChocoInstallOutput] = useState('')
  const [chocoInstalled, setChocoInstalled] = useState<'unknown' | 'yes' | 'no'>('unknown')
  const [pkgInstalling, setPkgInstalling] = useState<string | null>(null)
  const [pkgUninstalling, setPkgUninstalling] = useState<string | null>(null)
  const [pkgActionOutput, setPkgActionOutput] = useState<{ pkg: string; output: string; success: boolean } | null>(null)
  const [pkgInstallArgs, setPkgInstallArgs] = useState('')
  const [pkgShowArgsModal, setPkgShowArgsModal] = useState<string | null>(null)

  // Escape key for modals
  useEscapeKey(() => setPkgShowArgsModal(null), !!pkgShowArgsModal)

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
          <IconSearch className="w-12 h-12 mx-auto mb-3 text-gray-400" />
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

  // Software tab handlers
  const handlePkgSearch = async () => {
    if (!id || !pkgSearchQuery.trim() || !isActive) return
    setPkgSearchLoading(true)
    setPkgSearchError('')
    setPkgSearchResults([])
    try {
      const result = await apiService.searchPackages(id, pkgSearchQuery.trim(), pkgManager)
      if (result.packages?.length) {
        setPkgSearchResults(result.packages)
      } else if (result.raw_output) {
        setPkgSearchError(result.raw_output)
      } else {
        setPkgSearchError('No packages found')
      }
    } catch (e: any) {
      setPkgSearchError(e.message || 'Search failed')
    } finally {
      setPkgSearchLoading(false)
    }
  }

  const handlePkgListInstalled = async () => {
    if (!id || !isActive) return
    setPkgInstalledLoading(true)
    setPkgInstalled([])
    try {
      const result = await apiService.listPackages(id, pkgManager)
      if (result.output) {
        // Parse table output
        const lines = result.output.split('\n')
        const packages: any[] = []
        let headerPassed = false
        for (const line of lines) {
          if (!headerPassed) { if (line.includes('---')) headerPassed = true; continue }
          const trimmed = line.trim()
          if (!trimmed) continue
          const parts = trimmed.split(/\s{2,}/)
          if (parts.length >= 2) {
            packages.push({
              name: parts[0] || '',
              id: parts[1] || parts[0],
              version: parts[2] || '',
              source: parts[3] || pkgManager,
              manager: pkgManager,
            })
          }
        }
        setPkgInstalled(packages)
      }
    } catch (e: any) {
      setPkgSearchError(e.message || 'Failed to list packages')
    } finally {
      setPkgInstalledLoading(false)
    }
  }

  const handlePkgInstall = async (pkg: any, args: string = '') => {
    if (!id || !isActive) return
    setPkgInstalling(pkg.id)
    setPkgActionOutput(null)
    try {
      const result = await apiService.installPackage(id, pkg.id, pkg.manager, args)
      setPkgActionOutput({
        pkg: pkg.id,
        success: result.success ?? true,
        output: result.output || `Install completed (session: ${result.session_id || 'done'})`,
      })
      // Refresh installed list after install
      setTimeout(() => handlePkgListInstalled(), 3000)
    } catch (e: any) {
      setPkgActionOutput({ pkg: pkg.id, success: false, output: `Failed: ${e.message}` })
    } finally {
      setPkgInstalling(null)
      setPkgShowArgsModal(null)
    }
  }

  const handlePkgUninstall = async (pkg: any) => {
    if (!id || !isActive) return
    if (!confirm(`Uninstall "${pkg.name || pkg.id}"?`)) return
    setPkgUninstalling(pkg.id)
    setPkgActionOutput(null)
    try {
      const result = await apiService.uninstallPackage(id, pkg.id || pkg.name, pkg.manager)
      setPkgActionOutput({
        pkg: pkg.id || pkg.name,
        success: result.success ?? true,
        output: result.output || `Uninstall completed`,
      })
      setTimeout(() => handlePkgListInstalled(), 3000)
    } catch (e: any) {
      setPkgActionOutput({ pkg: pkg.id || pkg.name, success: false, output: `Failed: ${e.message}` })
    } finally {
      setPkgUninstalling(null)
    }
  }

  const handleInstallChocolatey = async () => {
    if (!id || !isActive) return
    setChocoInstalling(true)
    setChocoInstallOutput('')
    try {
      const result = await apiService.installChocolatey(id)
      const output = result.output || ''
      if (output.toLowerCase().includes('already installed')) {
        setChocoInstalled('yes')
        setChocoInstallOutput('')
      } else {
        setChocoInstallOutput(result.success ? 'Chocolatey installed successfully!' : 'Installation may have failed.')
        if (result.success) {
          setChocoInstalled('yes')
          setPkgManager('chocolatey')
          setTimeout(() => handlePkgListInstalled(), 2000)
        }
      }
    } catch (e: any) {
      setChocoInstallOutput(`Error: ${e.message}`)
    } finally {
      setChocoInstalling(false)
    }
  }

  // Auto-check Chocolatey status when software tab is first viewed
  const chocoCheckedRef = useRef(false)
  useEffect(() => {
    if (activeTab !== 'software' || !id || !isActive || chocoCheckedRef.current) return
    chocoCheckedRef.current = true
    apiService.installChocolatey(id).then(result => {
      const output = (result.output || '').toLowerCase()
      setChocoInstalled(output.includes('already installed') ? 'yes' : 'no')
    }).catch(() => {
      setChocoInstalled('no')
    })
  }, [activeTab, id, isActive])

  const services = parseJsonSafe(agent.services_json, [])
  const cpuPct = agent.cpu_percent ?? 0
  const memPct = memory.percent ?? 0

  // Render Remote Desktop as a full-screen overlay
  if (showDesktop && id) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <RemoteDesktop agentId={id} token={token} onClose={() => setShowDesktop(false)} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link to="/devices" className="hover:text-blue-500">Devices</Link>
        <IconChevronRight className="w-4 h-4" />
        <span className="text-gray-900 dark:text-white font-medium">{agent.hostname || id}</span>
      </div>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-4 h-4 rounded-full ${agent.status === 'online' ? 'bg-green-500 status-online' : agent.status === 'overdue' || agent.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{agent.hostname || 'Unknown'}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  {agent.plat === 'windows' ? <IconWindows className="w-4 h-4" /> :
                   agent.plat === 'linux' ? <IconLinux className="w-4 h-4" /> :
                   <IconApple className="w-4 h-4" />}
                  {agent.os_name || agent.plat || 'Unknown'}
                </span>
                <span>·</span>
                <span className="font-mono">{agent.local_ip || '—'}</span>
                <span>·</span>
                <span>{agent.public_ip || '—'}</span>
                <span>·</span>
                <span>v{agent.version || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowTerminal(!showTerminal)}
              className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${showTerminal ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              <IconTerminalSVG className="w-4 h-4" />
              {showTerminal ? 'Hide Terminal' : 'Terminal'}
            </button>
            {isActive && (
              <button
                onClick={() => setShowDesktop(true)}
                className="px-4 py-2 text-sm rounded-lg transition-colors bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-2"
                title="Open built-in Remote Desktop"
              >
                <IconMonitor className="w-4 h-4" />
                Remote Desktop
              </button>
            )}
            {isActive && (
              <button
                onClick={async () => {
                  if (confirm('Restart the agent on this device?')) {
                    await fetch(`/agents/${id}/restart/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
                  }
                }}
                className="px-4 py-2 text-sm rounded-lg transition-colors bg-orange-600 text-white hover:bg-orange-700 flex items-center gap-2"
              >
                <IconRefresh className="w-4 h-4" />
                Restart Agent
              </button>
            )}
            {isActive && (
              <button
                onClick={async () => {
                  if (confirm('Reboot this device? The machine will restart in 5 seconds.')) {
                    await fetch(`/agents/${id}/reboot/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
                  }
                }}
                className="px-4 py-2 text-sm rounded-lg transition-colors bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
                title="Reboot the device"
              >
                <IconPower className="w-4 h-4" />
                Reboot
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
              className="px-4 py-2 text-sm rounded-lg transition-colors bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
            >
              <IconTrash className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Remote Desktop info banner */}
        {isActive && (
          <div className="mt-3 p-3 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-sm flex items-center gap-2">
            <IconMonitor className="w-4 h-4 flex-shrink-0" />
            <span>
              <span className="font-medium">Remote Desktop available</span>
              <span className="opacity-75"> — Click "Remote Desktop" to connect to this device's screen</span>
            </span>
          </div>
        )}
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
          {(['overview', 'services', 'software', 'checks', 'scripts', 'events'] as const).map(tab => (
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
                  <InfoRow label="Remote Desktop" value={isActive ? 'Available' : 'Offline'} />
                </div>
              </div>

              {/* Quick Stats */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Activity</h3>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Services" value={services.length || '—'} icon={<IconWrench size={18} />} />
                  <MiniStat label="Processes" value={agent.running_processes ?? '—'} icon={<IconSettings size={18} />} />
                  <MiniStat label="CPU Usage" value={`${cpuPct.toFixed(1)}%`} icon={<IconCpu size={18} />} />
                  <MiniStat label="Memory Usage" value={`${memPct.toFixed(1)}%`} icon={<IconZap size={18} />} />
                  <MiniStat label="Logged-in Users" value={users.length || '—'} icon={<IconUserIcon size={18} />} />
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

          {activeTab === 'software' && (
            <div className="space-y-4">
              {/* Manager selector + list installed */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Software Management</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={pkgManager}
                    onChange={e => setPkgManager(e.target.value as 'winget' | 'chocolatey')}
                    className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white"
                  >
                    <option value="winget">{<><IconWindows size={14} /> Winget</>}</option>
                    <option value="chocolatey">Chocolatey</option>
                  </select>
                  <button
                    onClick={handlePkgListInstalled}
                    disabled={!isActive || pkgInstalledLoading}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {pkgInstalledLoading ? 'Loading...' : 'List Installed'}
                  </button>
                  {chocoInstalled === 'yes' ? (
                    <span className="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg inline-flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Chocolatey Installed
                    </span>
                  ) : chocoInstalled === 'no' ? (
                    <button
                      onClick={handleInstallChocolatey}
                      disabled={!isActive || chocoInstalling}
                      className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                      title="Install Chocolatey package manager on this device"
                    >
                      {chocoInstalling ? 'Installing...' : 'Install Chocolatey'}
                    </button>
                  ) : (
                    <button
                      onClick={handleInstallChocolatey}
                      disabled={!isActive || chocoInstalling}
                      className="px-3 py-1.5 text-sm bg-gray-400 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50 transition-colors animate-pulse"
                      title="Checking Chocolatey status..."
                    >
                      {chocoInstalling ? 'Checking...' : 'Checking...'}
                    </button>
                  )}
                </div>
              </div>

              {/* Chocolatey install status */}
              {chocoInstallOutput && (
                <div className={`text-xs p-2 rounded ${chocoInstallOutput.startsWith('Error') ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
                  {chocoInstallOutput}
                </div>
              )}

              {/* Installed packages */}
              {pkgInstalled.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Installed Packages ({pkgInstalled.length})
                  </h4>
                  <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Name</th>
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">ID</th>
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Version</th>
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Source</th>
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pkgInstalled.map((pkg: any, i: number) => (
                          <tr key={`${pkg.id}-${i}`} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="py-1.5 px-3 text-gray-700 dark:text-gray-300">{pkg.name}</td>
                            <td className="py-1.5 px-3 font-mono text-xs text-gray-500 dark:text-gray-400">{pkg.id}</td>
                            <td className="py-1.5 px-3 text-gray-500 dark:text-gray-400 text-xs">{pkg.version}</td>
                            <td className="py-1.5 px-3 text-xs text-gray-400">{pkg.source}</td>
                            <td className="py-1.5 px-3">
                              <button
                                onClick={() => handlePkgUninstall(pkg)}
                                disabled={pkgUninstalling === pkg.id}
                                className="px-2 py-0.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                              >{pkgUninstalling === pkg.id ? 'Removing...' : 'Remove'}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Search bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><IconSearch size={14} /></span>
                  <input
                    value={pkgSearchQuery}
                    onChange={e => setPkgSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePkgSearch()}
                    placeholder={`Search ${pkgManager} packages...`}
                    disabled={!isActive}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={handlePkgSearch}
                  disabled={!isActive || pkgSearchLoading || !pkgSearchQuery.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {pkgSearchLoading ? 'Searching...' : 'Search'}
                </button>
              </div>

              {/* Popular quick-search */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400">Quick:</span>
                {['Firefox', 'Chrome', '7zip', 'Notepad++', 'VSCode', 'VLC'].map(q => (
                  <button
                    key={q}
                    onClick={() => { setPkgSearchQuery(q); setPkgSearchResults([]); setPkgSearchError('') }}
                    className="px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs rounded-md transition-colors"
                  >{q}</button>
                ))}
              </div>

              {/* Search error */}
              {pkgSearchError && (
                <div className="p-3 rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 text-sm whitespace-pre-wrap">
                  {pkgSearchError}
                </div>
              )}

              {/* Search results */}
              {pkgSearchResults.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Search Results ({pkgSearchResults.length} packages)
                  </h4>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700/50">
                    {pkgSearchResults.map((pkg: any) => (
                      <div key={pkg.id} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{pkg.name}</span>
                            {pkg.version && (
                              <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{pkg.version}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">{pkg.id} · {pkg.source}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => handlePkgInstall(pkg)}
                            disabled={pkgInstalling === pkg.id}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >{pkgInstalling === pkg.id ? 'Installing...' : '⬇ Install'}</button>
                          <button
                            onClick={() => setPkgShowArgsModal(pkg.id)}
                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            title="Install with custom arguments"
                          >⚙️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action output */}
              {pkgActionOutput && (
                <div className={`p-3 rounded-lg border ${pkgActionOutput.success ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {pkgActionOutput.success ? '✅' : '❌'} {pkgActionOutput.pkg}
                    </span>
                    <button onClick={() => setPkgActionOutput(null)} className="text-gray-400 hover:text-gray-200 text-xs">✕</button>
                  </div>
                  <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono overflow-x-auto max-h-40 overflow-y-auto">{pkgActionOutput.output}</pre>
                </div>
              )}

              {/* Not online notice */}
              {!isActive && (
                <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm text-center">
                  Device must be online to manage software
                </div>
              )}

              {/* Custom install args modal */}
              {pkgShowArgsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setPkgShowArgsModal(null)}>
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm modal-backdrop" />
                  <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full mx-4 p-6 modal-content" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2"><IconSettings size={16} className="inline mr-1" /> Custom Install Arguments</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Package: <span className="text-gray-900 dark:text-white font-mono">{pkgShowArgsModal}</span></p>
                    <input
                      value={pkgInstallArgs}
                      onChange={e => setPkgInstallArgs(e.target.value)}
                      placeholder="e.g. --override /S /D=C:\CustomPath"
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white mb-4"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setPkgShowArgsModal(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300">Cancel</button>
                      <button
                        onClick={() => {
                          const pkg = pkgSearchResults.find((p: any) => p.id === pkgShowArgsModal)
                          if (pkg) handlePkgInstall(pkg, pkgInstallArgs)
                          setPkgInstallArgs('')
                        }}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >Install</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'checks' && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <IconInfo className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
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
                            >↻ Restart</button>
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
              <IconInfo className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
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

const MiniStat = ({ label, value, icon }: { label: string; value: any; icon: React.ReactNode }) => (
  <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3 flex items-center gap-3">
    <div className="text-blue-400">
      {icon}
    </div>
    <div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  </div>
)

export default DeviceDetail