import { useState } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { useClient } from '../contexts/ClientContext'

function ClientSelector({ collapsed }: { collapsed: boolean }) {
  const { clients, selectedClient, selectClient } = useClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  if (collapsed) {
    return (
      <div className="px-2 py-2 border-b border-gray-800/50">
        <button
          onClick={() => selectClient(null)}
          className="w-full p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 text-xs transition-colors"
          title="All Clients"
        >
          🏢
        </button>
      </div>
    )
  }

  const filtered = search
    ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients

  return (
    <div className="px-3 py-3 border-b border-gray-800/50 relative">
      <button
        onClick={() => { setOpen(!open); setSearch('') }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm"
      >
        <span className="text-gray-300 truncate">
          {selectedClient ? selectedClient.name : 'All Clients'}
        </span>
        <svg className={`w-3 h-3 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-white/[0.06]">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              autoFocus
            />
          </div>
          {/* List */}
          <div className="overflow-y-auto flex-1">
            <button
              onClick={() => { selectClient(null); setOpen(false); setSearch('') }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors ${!selectedClient ? 'text-blue-400 bg-blue-500/10' : 'text-gray-300'}`}
            >
              All Clients
            </button>
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => { selectClient(c); setOpen(false); setSearch('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors ${selectedClient?.id === c.id ? 'text-blue-400 bg-blue-500/10' : 'text-gray-300'}`}
              >
                {c.name}
                <span className="text-xs text-gray-600 ml-1">({c.sites?.length || 0})</span>
              </button>
            ))}
            {search && filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-600 text-center">No clients match &ldquo;{search}&rdquo;</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { selectedClient } = useClient()

  // When a client is selected, show client-scoped navigation
  const clientNav = [
    {
      label: selectedClient?.name || 'Client',
      items: [
        { icon: '📊', label: 'Dashboard', path: '/dashboard' },
        { icon: '💻', label: 'Devices', path: '/devices' },
        { icon: '📡', label: 'Monitoring', path: '/monitoring' },
        { icon: '🔔', label: 'Alerts', path: '/alerts' },
        { icon: '📜', label: 'Scripts', path: '/scripts' },
        { icon: '⚡', label: 'Automation', path: '/automation' },
        { icon: '📦', label: 'Software', path: '/software' },
        { icon: '🔧', label: 'Patches', path: '/patches' },
        { icon: '📥', label: 'Install Agent', path: '/install' },
      ]
    },
  ]

  // Global nav (always shown)
  const globalNav = [
    {
      label: 'System',
      items: [
        { icon: '🤖', label: 'AI Copilot', path: '/ai' },
        { icon: '📈', label: 'Reports', path: '/reports' },
        { icon: '📋', label: 'Audit Log', path: '/audit' },
        { icon: '👥', label: 'Users', path: '/users' },
        { icon: '⚙️', label: 'Settings', path: '/settings' },
      ]
    },
  ]

  // When no client selected, show clients list + global
  const noClientNav = [
    {
      items: [
        { icon: '🏢', label: 'Clients', path: '/clients' },
      ]
    },
    ...globalNav,
  ]

  const sections = selectedClient ? [...clientNav, ...globalNav] : noClientNav

  return (
    <aside className={`bg-gray-950 shrink-0 flex flex-col transition-all duration-200 ${collapsed ? 'w-[68px]' : 'w-[220px]'} border-r border-gray-800`}>
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-gray-800/50">
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-blue-500/20 shrink-0">
          OR
        </div>
        {!collapsed && <span className="font-semibold text-white tracking-tight">OpenRMM</span>}
      </div>

      {/* Client Selector */}
      <ClientSelector collapsed={collapsed} />

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