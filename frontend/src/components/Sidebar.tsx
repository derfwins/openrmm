import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const location = useLocation()

  const menuItems = [
    { icon: '📊', label: 'Dashboard', path: '/dashboard' },
    { icon: '💻', label: 'Devices', path: '/devices' },
    { icon: '🔔', label: 'Alerts', path: '/alerts' },
    { icon: '📜', label: 'Scripts', path: '/scripts' },
    { icon: '⚡', label: 'Automation', path: '/automation' },
    { icon: '📦', label: 'Software', path: '/software' },
    { icon: '🔧', label: 'Patches', path: '/patches' },
    { icon: '📈', label: 'Reports', path: '/reports' },
    { icon: '🤖', label: 'AI Copilot', path: '/ai' },
    { icon: '⚙️', label: 'Settings', path: '/settings' },
  ]

  return (
    <aside className={`bg-gray-900 text-white transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-64'} flex flex-col`}>
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">
            OR
          </div>
          {!isCollapsed && <span className="font-semibold text-lg">OpenRMM</span>}
        </div>
      </div>

      <nav className="p-2 flex-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 w-full flex justify-center"
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
