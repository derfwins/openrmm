import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import DeviceList from './components/DeviceList'
import DeviceDetail from './components/DeviceDetail'
import ScriptLibrary from './components/ScriptLibrary'
import AlertPanel from './components/AlertPanel'
import PatchManager from './components/PatchManager'
import AutomationBuilder from './components/AutomationBuilder'
import Reports from './components/Reports'
import SoftwareManager from './components/SoftwareManager'
import Settings from './components/Settings'
import AICopilot from './components/AICopilot'
import UserManagement from './components/UserManagement'
import Sidebar from './components/Sidebar'

// Auth context
export const AuthContext = {
  isAuthenticated: () => localStorage.getItem('token') !== null,
  logout: () => {
    localStorage.removeItem('token')
    window.location.href = '/login'
  },
  getToken: () => localStorage.getItem('token'),
}

// Layout wrapper with sidebar
const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  if (!AuthContext.isAuthenticated()) {
    return <Navigate to="/login" />
  }

  return (
    <div className={`flex h-screen ${darkMode ? 'dark' : ''}`}>
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">admin</span>
            <button
              onClick={AuthContext.logout}
              className="text-sm text-red-500 hover:text-red-600"
            >
              Logout
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={AuthContext.isAuthenticated() ? <Navigate to="/dashboard" /> : <Login />}
        />
        <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
        <Route path="/devices" element={<AppLayout><DeviceList /></AppLayout>} />
        <Route path="/device/:id" element={<AppLayout><DeviceDetail /></AppLayout>} />
        <Route path="/scripts" element={<AppLayout><ScriptLibrary /></AppLayout>} />
        <Route path="/alerts" element={<AppLayout><AlertPanel /></AppLayout>} />
        <Route path="/software" element={<AppLayout><SoftwareManager /></AppLayout>} />
        <Route path="/patches" element={<AppLayout><PatchManager /></AppLayout>} />
        <Route path="/automation" element={<AppLayout><AutomationBuilder /></AppLayout>} />
        <Route path="/reports" element={<AppLayout><Reports /></AppLayout>} />
        <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
        <Route path="/ai" element={<AppLayout><AICopilot /></AppLayout>} />
        <Route path="/users" element={<AppLayout><UserManagement /></AppLayout>} />
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App