import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const sections = [
    {
      items: [
        { icon: '📊', label: 'Dashboard', path: '/dashboard' },
        { icon: '💻', label: 'Devices', path: '/devices' },
        { icon: '🏢', label: 'Clients', path: '/clients' },
        { icon: '📥', label: 'Install Agent', path: '/install' },
      ]
    },
    {
      label: 'Management',
      items: [
        { icon: '🔔', label: 'Alerts', path: '/alerts' },
        { icon: '📜', label: 'Scripts', path: '/scripts' },
        { icon: '⚡', label: 'Automation', path: '/automation' },
        { icon: '📦', label: 'Software', path: '/software' },
        { icon: '🔧', label: 'Patches', path: '/patches' },
      ]
    },
    {
      label: 'System',
      items: [
        { icon: '📈', label: 'Reports', path: '/reports' },
        { icon: '🤖', label: 'AI Copilot', path: '/ai' },
        { icon: '👥', label: 'Users', path: '/users' },
        { icon: '⚙️', label: 'Settings', path: '/settings' },
      ]
    },
  ]

  return (
    <aside className={`bg-gray-950 shrink-0 flex flex-col transition-all duration-200 ${collapsed ? 'w-[68px]' : 'w-[220px]'} border-r border-gray-800`}>
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-gray-800/50">
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-blue-500/20 shrink-0">
          OR
        </div>
        {!collapsed && <span className="font-semibold text-white tracking-tight">OpenRMM</span>}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 py-3 px-2.5 overflow-y-auto space-y-5">
        {sections.map((section, si) => (
          <div key={si}>
            {!collapsed && section.label && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
                return (
                  <Link
                    key={item.label}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                      active
                        ? 'bg-blue-600/15 text-blue-400 font-medium'
                        : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                    }`}
                  >
                    <span className={`text-base ${active ? 'drop-shadow-[0_0_6px_rgba(59,130,246,0.5)]' : ''}`}>
                      {item.icon}
                    </span>
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2.5 border-t border-gray-800/50">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors text-sm"
        >
          <span className="text-xs">{collapsed ? '→' : '←'}</span>
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar