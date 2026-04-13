import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { AuthContext } from '../App'

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
    { icon: '👥', label: 'Users', path: '/users' },
    { icon: '⚙️', label: 'Settings', path: '/settings' },
  ]

  return (
    <aside className={`bg-gray-900 text-white transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-56'} flex flex-col shrink-0`}>
      <div className="p-4 border-b border-gray-700">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-sm shadow-lg shadow-blue-500/20">
            OR
          </div>
          {!isCollapsed && <span className="font-semibold text-lg tracking-tight">OpenRMM</span>}
        </Link>
      </div>

      <nav className="p-2 flex-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 mb-0.5 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="text-lg">{item.icon}</span>
              {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-700">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white w-full flex justify-center transition-colors"
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar