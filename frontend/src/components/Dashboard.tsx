import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import apiService from '../services/apiService'

interface DashboardStats {
  totalAgents: number
  onlineAgents: number
  offlineAgents: number
  totalAlerts: number
  totalClients: number
  totalSites: number
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalAgents: 0, onlineAgents: 0, offlineAgents: 0,
    totalAlerts: 0, totalClients: 0, totalSites: 0,
  })
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<any>(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      setLoading(true)
      const [agentsData, clientsData] = await Promise.allSettled([
        apiService.getDevices(),
        apiService.getClients(),
      ])

      // Handle agents
      if (agentsData.status === 'fulfilled') {
        const agentList = agentsData.value.results || agentsData.value || []
        setAgents(agentList)
        const online = agentList.filter((a: any) => a.status === 'online').length
        setStats(prev => ({
          ...prev,
          totalAgents: agentList.length,
          onlineAgents: online,
          offlineAgents: agentList.length - online,
        }))
      } else {
        // API might return 403 or different format — that's fine for empty state
        setAgents([])
      }

      // Handle clients
      if (clientsData.status === 'fulfilled') {
        const clientList = clientsData.value.results || clientsData.value || []
        setStats(prev => ({ ...prev, totalClients: clientList.length }))
      }

      // Get alerts count
      try {
        const alertsData = await apiService.getAlerts(false) // unresolved only
        const alertList = Array.isArray(alertsData) ? alertsData : []
        setStats(prev => ({ ...prev, totalAlerts: alertList.length }))
      } catch { /* non-critical */ }

      // Health check
      try {
        const healthData = await apiService.getHealth()
        setHealth(healthData)
      } catch { /* non-critical */ }
    } catch (err: any) {
      // If 403 or auth error, just show empty state
      if (err?.message?.includes('403') || err?.message?.includes('401')) {
        setError('session_expired')
      } else {
        setError('Failed to load dashboard data')
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent"></div>
          <span className="text-gray-500 dark:text-gray-400 text-sm">Loading dashboard...</span>
        </div>
      </div>
    )
  }

  if (error === 'session_expired') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-500 mb-4">Session expired. Please log in again.</p>
          <Link to="/login" className="text-blue-500 hover:underline">Back to login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={loadDashboard}
          className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          <span className={`inline-block ${loading ? 'animate-spin' : ''}`}>↻</span>
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Agents"
          value={stats.totalAgents}
          icon="💻"
          color="blue"
          link="/devices"
        />
        <StatCard
          title="Online"
          value={stats.onlineAgents}
          icon="🟢"
          color="green"
          link="/devices?filter=online"
        />
        <StatCard
          title="Offline"
          value={stats.offlineAgents}
          icon="🔴"
          color="red"
          link="/devices?filter=offline"
        />
        <StatCard
          title="Clients"
          value={stats.totalClients}
          icon="🏢"
          color="purple"
          link="/clients"
        />
        <StatCard
          title="Alerts"
          value={stats.totalAlerts}
          icon="⚠️"
          color="orange"
          link="/alerts"
        />
        <StatCard
          title="Alerts"
          value={stats.totalAlerts}
          icon="⚠️"
          color="orange"
          link="/alerts"
        />
      </div>

      {/* Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <QuickAction icon="📜" label="Run a Script" link="/scripts" />
            <QuickAction icon="🔧" label="Check for Patches" link="/patches" />
            <QuickAction icon="⚡" label="New Automation" link="/automation" />
            <QuickAction icon="📈" label="Generate Report" link="/reports" />
            <QuickAction icon="🤖" label="Ask AI Copilot" link="/ai" />
          </div>
        </div>

        {/* Agents Overview */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Agents</h2>
            <Link to="/devices" className="text-xs text-blue-500 hover:text-blue-600 font-medium">
              View all →
            </Link>
          </div>

          {agents.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-3">🖥️</div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">No agents yet</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Install the OpenRMM agent on your devices to start monitoring.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {agents.slice(0, 5).map((agent: any) => (
                <Link
                  key={agent.agent_id || agent.id}
                  to={`/device/${agent.agent_id || agent.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${agent.status === 'online' ? 'bg-green-500 status-online' : 'bg-gray-400'}`} />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{agent.hostname || agent.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{agent.local_ip || agent.wan_ip}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{agent.site_name || 'Default'}</span>
                    <span className="text-gray-300">→</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">System Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatusIndicator name="Backend API" status={health ? 'healthy' : 'checking'} />
          <StatusIndicator name="Frontend" status="healthy" />
          <StatusIndicator name="Guacamole" status="healthy" />
          <StatusIndicator name="Database" status={health?.database === 'connected' ? 'healthy' : health?.database === 'error' ? 'unhealthy' : 'checking'} />
        </div>
      </div>
    </div>
  )
}

// Stat Card Component
const StatCard = ({ title, value, icon, color, link }: {
  title: string; value: number; icon: string; color: string; link: string
}) => {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-indigo-600',
    green: 'from-emerald-500 to-green-600',
    red: 'from-red-500 to-rose-600',
    orange: 'from-amber-500 to-orange-600',
    purple: 'from-violet-500 to-purple-600',
  }

  return (
    <Link
      to={link}
      className="stat-card stat-card-${color} bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-all hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorMap[color] || colorMap.blue} flex items-center justify-center text-xl shadow-lg`}>
          {icon}
        </div>
      </div>
    </Link>
  )
}

// Quick Action Component
const QuickAction = ({ icon, label, link }: { icon: string; label: string; link: string }) => (
  <Link
    to={link}
    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
  >
    <span className="text-lg">{icon}</span>
    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
      {label}
    </span>
    <span className="ml-auto text-gray-300 group-hover:text-gray-500 transition-colors">→</span>
  </Link>
)

// Status Indicator
const StatusIndicator = ({ name, status }: { name: string; status?: 'healthy' | 'unhealthy' | 'checking' }) => (
  <div className="flex items-center gap-2">
    <div className={`w-2.5 h-2.5 rounded-full ${status === 'healthy' ? 'bg-green-500 status-online' : status === 'unhealthy' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
    <span className="text-sm text-gray-700 dark:text-gray-300">{name}</span>
    <span className="text-xs text-gray-400">{status === 'healthy' ? 'OK' : status === 'unhealthy' ? 'Error' : '...'}</span>
  </div>
)

export default Dashboard