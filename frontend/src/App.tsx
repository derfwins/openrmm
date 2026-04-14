import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, Component, ReactNode } from 'react'
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
import InstallAgent from './components/InstallAgent'
import Clients from './components/Clients'
import Sidebar from './components/Sidebar'

export const AuthContext = {
  isAuthenticated: () => localStorage.getItem('token') !== null,
  logout: () => { localStorage.removeItem('token'); localStorage.removeItem('username'); window.location.href = '/login' },
  getToken: () => localStorage.getItem('token'),
  getUsername: () => localStorage.getItem('username') || 'admin',
  setUsername: (name: string) => localStorage.setItem('username', name),
}

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved !== null ? JSON.parse(saved) : true  // Default to dark
  })

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Set dark on load
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [])

  if (!AuthContext.isAuthenticated()) return <Navigate to="/login" />

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-200"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                {AuthContext.getUsername()[0]?.toUpperCase() || 'A'}
              </div>
              <span className="text-sm text-gray-300 font-medium">{AuthContext.getUsername()}</span>
            </div>
            <button
              onClick={AuthContext.logout}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>
        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) { return { error: e.message + '\n' + (e.stack || '') } }
  render() {
    if (this.state.error) return (
      <div className="p-8 text-red-500 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold mb-4">Component Error</h1>
        <pre className="whitespace-pre-wrap text-sm bg-black p-4 rounded overflow-auto">{this.state.error}</pre>
        <button onClick={() => { this.setState({ error: null }); window.location.reload() }} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Reload</button>
      </div>
    )
    return this.props.children
  }
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <Routes>
        <Route path="/login" element={AuthContext.isAuthenticated() ? <Navigate to="/dashboard" /> : <Login />} />
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
        <Route path="/clients" element={<AppLayout><Clients /></AppLayout>} />
        <Route path="/install" element={<AppLayout><InstallAgent /></AppLayout>} />
        <Route path="/ai" element={<AppLayout><AICopilot /></AppLayout>} />
        <Route path="/users" element={<AppLayout><UserManagement /></AppLayout>} />
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App