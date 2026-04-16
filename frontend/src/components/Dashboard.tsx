import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import apiService from '../services/apiService'
import { useClient } from '../contexts/ClientContext'

interface DashboardStats {
  totalAgents: number
  onlineAgents: number
  offlineAgents: number
  totalAlerts: number
}

interface PlatformCount {
  windows: number
  linux: number
  mac: number
  other: number
}

interface HealthData {
  status: string
  database: string
  agents: number
  agents_online: number
  users: number
  clients: number
}

interface AlertItem {
  id: number
  alert_type: string
  message: string
  severity: string
  agent?: { hostname: string }
  is_resolved: boolean
  created_at: string
}

const REFRESH_INTERVAL = 30_000

const Dashboard = () => {
  const { selectedClient } = useClient()
  const [stats, setStats] = useState<DashboardStats>({
    totalAgents: 0, onlineAgents: 0, offlineAgents: 0, totalAlerts: 0,
  })
  const [platforms, setPlatforms] = useState<PlatformCount>({ windows: 0, linux: 0, mac: 0, other: 0 })
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const loadDashboard = useCallback(async () => {
    try {
      setError(null)
      const clientId = selectedClient?.id

      const [agentsResult, alertsResult, healthResult] = await Promise.allSettled([
        apiService.getDevices(clientId),
        apiService.getAlerts(false),
        apiService.getHealth(),
      ])

      // Agents
      if (agentsResult.status === 'fulfilled') {
        const raw = agentsResult.value
        const agentList: any[] = Array.isArray(raw) ? raw : (raw?.results ?? [])
        const online = agentList.filter((a: any) => a.status === 'online').length

        setStats({
          totalAgents: agentList.length,
          onlineAgents: online,
          offlineAgents: agentList.length - online,
          totalAlerts: 0, // filled below
        })

        const counts: PlatformCount = { windows: 0, linux: 0, mac: 0, other: 0 }
        for (const a of agentList) {
          const os = (a.os || a.platform || a.operating_system || '').toLowerCase()
          if (os.includes('win')) counts.windows++
          else if (os.includes('lin') || os.includes('ubuntu') || os.includes('debian') || os.includes('centos') || os.includes('fedora')) counts.linux++
          else if (os.includes('mac') || os.includes('darwin')) counts.mac++
          else counts.other++
        }
        setPlatforms(counts)
      }

      // Alerts
      if (alertsResult.status === 'fulfilled') {
        const raw = alertsResult.value
        const alertList: AlertItem[] = Array.isArray(raw) ? raw : (raw?.results ?? [])
        setAlerts(alertList.slice(0, 5))
        setStats(prev => ({ ...prev, totalAlerts: alertList.length }))
      }

      // Health
      if (healthResult.status === 'fulfilled') {
        setHealth(healthResult.value)
      }

      setLastRefresh(new Date())
    } catch (_err) {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [selectedClient?.id])

  // Initial load + auto-refresh
  useEffect(() => {
    loadDashboard()
    const interval = setInterval(loadDashboard, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [loadDashboard])

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 space-y-6">
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-64 bg-gray-800 rounded-xl animate-pulse" />
          <div className="lg:col-span-2 h-64 bg-gray-800 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  // ── Error with retry ──
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <p className="text-gray-300 text-lg">{error}</p>
          <button
            onClick={loadDashboard}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {lastRefresh
              ? `Last updated ${lastRefresh.toLocaleTimeString()} · Auto-refresh every 30s`
              : 'Loading...'}
          </p>
        </div>
        <button
          onClick={loadDashboard}
          className="px-4 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors text-gray-300 flex items-center gap-2"
        >
          <span>↻</span> Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Agents" value={stats.totalAgents} icon="💻" gradient="from-blue-600 to-indigo-700" link="/devices" />
        <StatCard title="Online" value={stats.onlineAgents} icon="🟢" gradient="from-emerald-600 to-green-700" link="/devices?filter=online" />
        <StatCard title="Offline" value={stats.offlineAgents} icon="🔴" gradient="from-red-600 to-rose-700" link="/devices?filter=offline" />
        <StatCard title="Alerts" value={stats.totalAlerts} icon="⚠️" gradient="from-amber-600 to-orange-700" link="/alerts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Platform Breakdown */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Agent Platforms</h2>
          <div className="space-y-3">
            <PlatformBar label="Windows" count={platforms.windows} total={stats.totalAgents} color="bg-blue-500" icon="🪟" />
            <PlatformBar label="Linux" count={platforms.linux} total={stats.totalAgents} color="bg-yellow-500" icon="🐧" />
            <PlatformBar label="macOS" count={platforms.mac} total={stats.totalAgents} color="bg-gray-400" icon="🍎" />
            <PlatformBar label="Other" count={platforms.other} total={stats.totalAgents} color="bg-purple-500" icon="📦" />
          </div>

          {/* System Health */}
          <div className="mt-6 pt-4 border-t border-gray-700">
            <h2 className="text-sm font-semibold text-white mb-3">System Health</h2>
            <div className="space-y-2">
              <HealthIndicator name="API" ok={health?.status === 'ok'} />
              <HealthIndicator name="Database" ok={health?.database === 'connected'} />
            </div>
            {health && (
              <div className="mt-3 text-xs text-gray-500">
                {health.agents} agents registered · {health.agents_online} online · {health.clients} clients
              </div>
            )}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="bg-gray-800 rounded-xl border border-gray-700">
          <div className="flex items-center justify-between p-5 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-white">Recent Alerts</h2>
            <Link to="/alerts" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
              View all →
            </Link>
          </div>
          {alerts.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm text-gray-400">No unresolved alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {alerts.map((alert) => (
                <div key={alert.id} className="px-5 py-3 hover:bg-gray-750 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-sm mt-0.5">
                      {alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-200 truncate">{alert.message || alert.alert_type}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {alert.agent?.hostname && `${alert.agent.hostname} · `}
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <ActionCard icon="🚀" label="Deploy Agent" desc="Install on a new device" link="/devices" />
            <ActionCard icon="📜" label="Run Script" desc="Execute on agents" link="/scripts" />
            <ActionCard icon="🔔" label="View Alerts" desc={`${stats.totalAlerts} unresolved`} link="/alerts" />
            <ActionCard icon="🔧" label="Check Patches" desc="Windows updates" link="/patches" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

const StatCard = ({ title, value, icon, gradient, link }: {
  title: string; value: number; icon: string; gradient: string; link: string
}) => (
  <Link to={link} className="bg-gray-800 rounded-xl border border-gray-700 p-5 hover:border-gray-600 transition-all hover:-translate-y-0.5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</p>
        <p className="text-3xl font-bold text-white mt-1">{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-xl shadow-lg`}>
        {icon}
      </div>
    </div>
  </Link>
)

const PlatformBar = ({ label, count, total, color, icon }: {
  label: string; count: number; total: number; color: string; icon: string
}) => {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400 flex items-center gap-1.5">{icon} {label}</span>
        <span className="text-xs text-gray-500">{count} ({Math.round(pct)}%)</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const HealthIndicator = ({ name, ok }: { name: string; ok?: boolean }) => (
  <div className="flex items-center gap-2">
    <div className={`w-2.5 h-2.5 rounded-full ${ok === true ? 'bg-green-500' : ok === false ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
    <span className="text-sm text-gray-300">{name}</span>
    <span className="text-xs text-gray-500">{ok === true ? 'OK' : ok === false ? 'Error' : '...'}</span>
  </div>
)

const ActionCard = ({ icon, label, desc, link }: {
  icon: string; label: string; desc: string; link: string
}) => (
  <Link
    to={link}
    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-700 transition-colors group"
  >
    <span className="text-xl">{icon}</span>
    <div>
      <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">{label}</p>
      <p className="text-xs text-gray-500">{desc}</p>
    </div>
    <span className="ml-auto text-gray-600 group-hover:text-gray-400 transition-colors">→</span>
  </Link>
)

export default Dashboard