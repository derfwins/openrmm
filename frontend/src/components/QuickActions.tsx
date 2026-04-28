import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { IconChartBar, IconBell, IconWrench, IconMonitor, IconClipboardList, IconGear, IconDashboard, IconDevices, IconScripts, IconAutomation, IconTerminal, IconCopy, IconReports, IconUsers, IconSoftware, IconClients, IconAI, IconInstall, IconAntenna } from './Icons'

const iconMap: Record<string, ReactNode> = {
  chart: <IconChartBar size={18} />,
  bell: <IconBell size={18} />,
  wrench: <IconWrench size={18} />,
  monitor: <IconMonitor size={18} />,
  clipboard: <IconClipboardList size={18} />,
  gear: <IconGear size={18} />,
  dashboard: <IconDashboard size={18} />,
  devices: <IconDevices size={18} />,
  scripts: <IconScripts size={18} />,
  automation: <IconAutomation size={18} />,
  terminal: <IconTerminal size={18} />,
  install: <IconInstall size={18} />,
  reports: <IconReports size={18} />,
  users: <IconUsers size={18} />,
  software: <IconSoftware size={18} />,
  clients: <IconClients size={18} />,
  ai: <IconAI size={18} />,
  lock: <IconLock size={18} />,
}

interface Action {
  id: string
  label: string
  description: string
  icon: string
  path?: string
  action?: () => void
  category: string
}

const actions: Action[] = [
  { id: 'dashboard', label: 'Go to Dashboard', description: 'View system overview', icon: 'chart', path: '/dashboard', category: 'Navigation' },
  { id: 'devices', label: 'View All Devices', description: 'List and manage devices', icon: 'devices', path: '/devices', category: 'Navigation' },
  { id: 'alerts', label: 'View Alerts', description: 'Check system alerts', icon: 'bell', path: '/alerts', category: 'Navigation' },
  { id: 'scripts', label: 'Script Library', description: 'Manage and run scripts', icon: 'scripts', path: '/scripts', category: 'Navigation' },
  { id: 'patches', label: 'Patch Manager', description: 'Manage patches and updates', icon: 'wrench', path: '/patches', category: 'Navigation' },
  { id: 'automation', label: 'Automation Builder', description: 'Create automated tasks', icon: 'automation', path: '/automation', category: 'Navigation' },
  { id: 'remote', label: 'Remote Desktop', description: 'Connect to a device remotely', icon: 'monitor', path: '/remote', category: 'Tools' },
  { id: 'terminal', label: 'Open Terminal', description: 'Start a remote shell session', icon: 'terminal', path: '/terminal', category: 'Tools' },
  { id: 'ai', label: 'AI Copilot', description: 'Ask AI for help', icon: 'ai', path: '/ai', category: 'Tools' },
  { id: 'install', label: 'Deploy Agent', description: 'Install agent on new device', icon: 'install', path: '/install', category: 'Actions' },
  { id: 'reports', label: 'Generate Report', description: 'Create system report', icon: 'reports', path: '/reports', category: 'Actions' },
  { id: 'audit', label: 'Audit Log', description: 'View system audit trail', icon: 'clipboard', path: '/audit', category: 'Navigation' },
  { id: 'users', label: 'Manage Users', description: 'User and role management', icon: 'users', path: '/users', category: 'Navigation' },
  { id: 'settings', label: 'Settings', description: 'System configuration', icon: 'gear', path: '/settings', category: 'Navigation' },
  { id: 'software', label: 'Software Manager', description: 'Manage installed software', icon: 'software', path: '/software', category: 'Navigation' },
  { id: 'clients', label: 'Clients & Sites', description: 'Manage clients and sites', icon: 'clients', path: '/clients', category: 'Navigation' },
]

const QuickActions = () => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('recentActions') || '[]')
    } catch { return [] }
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
        setSearch('')
        setSelectedIndex(0)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const filteredActions = search
    ? actions.filter(a =>
        a.label.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase()) ||
        a.category.toLowerCase().includes(search.toLowerCase())
      )
    : [
        ...recentIds.map(id => actions.find(a => a.id === id)).filter(Boolean) as Action[],
        ...actions.filter(a => !recentIds.includes(a.id)),
      ]

  const executeAction = (action: Action) => {
    setOpen(false)
    setRecentIds(prev => {
      const next = [action.id, ...prev.filter(id => id !== action.id)].slice(0, 5)
      localStorage.setItem('recentActions', JSON.stringify(next))
      return next
    })
    if (action.path) navigate(action.path)
    if (action.action) action.action()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, filteredActions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const action = filteredActions[selectedIndex]
      if (action) executeAction(action)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
          <span className="text-gray-400">🔍</span>
          <input
            ref={inputRef}
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search actions, pages, commands..."
            className="flex-1 bg-transparent text-white outline-none text-sm placeholder-gray-500"
          />
          <kbd className="px-2 py-0.5 bg-gray-700 text-gray-400 text-xs rounded border border-gray-600">ESC</kbd>
        </div>

        {/* Actions List */}
        <div className="max-h-80 overflow-y-auto py-2">
          {!search && recentIds.length > 0 && (
            <div className="px-3 py-1.5 text-xs text-gray-500 uppercase tracking-wider font-medium">
              Recent
            </div>
          )}
          {filteredActions.map((action, i) => (
            <button
              key={action.id}
              onClick={() => executeAction(action)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === selectedIndex ? 'bg-blue-600/20 text-white' : 'text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              <span className="text-lg w-8 text-center">{iconMap[action.icon] || action.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{action.label}</div>
                <div className="text-xs text-gray-500">{action.description}</div>
              </div>
              <span className="text-xs text-gray-600 bg-gray-700/50 px-1.5 py-0.5 rounded">
                {action.category}
              </span>
            </button>
          ))}
          {filteredActions.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No actions found for "{search}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-700 flex items-center gap-4 text-xs text-gray-500">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>⌘K Toggle</span>
        </div>
      </div>
    </div>
  )
}

export default QuickActions