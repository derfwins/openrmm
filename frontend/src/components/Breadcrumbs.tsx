import { useLocation, useNavigate } from 'react-router-dom'

const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  devices: 'Devices',
  device: 'Device',
  monitoring: 'Monitoring',
  clients: 'Clients',
  alerts: 'Alerts',
  scripts: 'Scripts',
  automation: 'Automation',
  software: 'Software',
  patches: 'Patches',
  install: 'Install Agent',
  settings: 'Settings',
  reports: 'Reports',
  audit: 'Audit Log',
  users: 'Users',
  ai: 'AI Copilot',
}

const Breadcrumbs = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const segments = location.pathname.split('/').filter(Boolean)

  if (segments.length === 0) return null

  const crumbs: { label: string; path: string }[] = [{ label: 'Home', path: '/clients' }]

  let accumulated = ''
  for (let i = 0; i < segments.length; i++) {
    accumulated += `/${segments[i]}`
    const label = routeLabels[segments[i]] ?? segments[i]
    crumbs.push({ label, path: accumulated })
  }

  return (
    <nav className="px-5 py-2 flex items-center gap-1 text-xs shrink-0" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-600">&gt;</span>}
            {isLast ? (
              <span className="text-gray-300">{crumb.label}</span>
            ) : (
              <button
                onClick={() => navigate(crumb.path)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                {crumb.label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}

export default Breadcrumbs