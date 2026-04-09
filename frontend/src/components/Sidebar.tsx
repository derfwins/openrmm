import { useState } from 'react'

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const menuItems = [
    { icon: '📊', label: 'Dashboard', active: true },
    { icon: '💻', label: 'Devices', active: false },
    { icon: '🔔', label: 'Alerts', active: false },
    { icon: '📜', label: 'Scripts', active: false },
    { icon: '⚡', label: 'Automation', active: false },
    { icon: '📦', label: 'Software', active: false },
    { icon: '🔧', label: 'Patches', active: false },
    { icon: '📈', label: 'Reports', active: false },
    { icon: '🤖', label: 'AI Copilot', active: false },
    { icon: '⚙️', label: 'Settings', active: false },
  ]

  return (
    <aside className={`bg-gray-900 text-white transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-64'}`}>
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">
            OR
          </div>
          {!isCollapsed && <span className="font-semibold text-lg">OpenRMM</span>}
        </div>
      </div>

      <nav className="p-2">
        {menuItems.map((item) => (
          <a
            key={item.label}
            href="#"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              item.active
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
          </a>
        ))}
      </nav>

      <div className="absolute bottom-4 left-4">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
