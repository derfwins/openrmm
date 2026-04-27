import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useState, useEffect, Component } from 'react'
import type { ReactNode } from 'react'
import { IconSun, IconMoon } from './components/Icons'
import { API_BASE_URL } from './config'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import DeviceList from './components/DeviceList'
import DeviceDetail from './components/DeviceDetail'
import ScriptLibrary from './components/ScriptLibrary'
import PatchManager from './components/PatchManager'
import AutomationBuilder from './components/AutomationBuilder'
import Reports from './components/Reports'
import Settings from './components/Settings'
import RemoteDesktop from './components/RemoteDesktop'
import AICopilot from './components/AICopilot'
import UserManagement from './components/UserManagement'
import InstallAgent from './components/InstallAgent'
import { Clients } from './components/Clients'
import AuditLog from './components/AuditLog'
import AlertPanel from './components/AlertPanel'
import Sidebar from './components/Sidebar'
import Breadcrumbs from './components/Breadcrumbs'
import NotificationCenter from './components/NotificationCenter'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { ClientProvider } from './contexts/ClientContext'

export const AuthContext = {
  isAuthenticated: () => localStorage.getItem('token') !== null,
  logout: () => { localStorage.removeItem('token'); localStorage.removeItem('username'); window.location.href = '/login' },
  getToken: () => localStorage.getItem('token'),
  getUsername: () => localStorage.getItem('username') || 'admin',
  setUsername: (name: string) => localStorage.setItem('username', name),
}

const AppLayout = ({ children }: { children: ReactNode }) => {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [_currentUsername, setCurrentUsername] = useState(AuthContext.getUsername())

  // Inactivity auto-logout (1 hour)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const resetTimer = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        window.location.href = '/login'
      }, 60 * 60 * 1000) // 1 hour
    }
    const events = ['mousedown', 'keydown', 'mousemove', 'touchstart']
    events.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer()
    return () => {
      clearTimeout(timeout)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [])

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = AuthContext.getToken()
        if (!token) return
        const base = API_BASE_URL
        const resp = await fetch(`${base}/v2/me/`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (resp.ok) {
          const data = await resp.json()
          if (data.username) {
            setCurrentUsername(data.username)
            AuthContext.setUsername(data.username)
          }
        }
      } catch {}
    }
    fetchUser()
  }, [])

  if (!AuthContext.isAuthenticated()) return <Navigate to="/login" />

  return (
    <div className={`flex h-screen ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className={`h-14 ${darkMode ? 'bg-gray-900 border-b border-gray-800' : 'bg-white border-b border-gray-200'} flex items-center justify-between px-5 shrink-0`}>
          <div className="flex items-center gap-3">
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-3">
            <NotificationCenter />
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-800 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null; errorInfo: string | null }> {
  state = { error: null as string | null, errorInfo: null as string | null }
  static getDerivedStateFromError(e: Error) { return { error: e.message + '\n' + (e.stack || ''), errorInfo: null } }
  componentDidCatch(e: Error, info: any) {
    console.error('[OpenRMM ErrorBoundary]', e, info)
    this.setState({ errorInfo: info?.componentStack || '' })
  }
  render() {
    if (this.state.error) return (
      <div className="p-8 text-red-500 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold mb-4">Component Error</h1>
        <pre className="whitespace-pre-wrap text-sm bg-black p-4 rounded overflow-auto max-h-[50vh]">{this.state.error}</pre>
        {this.state.errorInfo && (
          <>
            <h2 className="text-lg font-bold mt-4 mb-2">Component Stack</h2>
            <pre className="whitespace-pre-wrap text-sm bg-black p-4 rounded overflow-auto max-h-[30vh]">{this.state.errorInfo}</pre>
          </>
        )}
        <button onClick={() => { this.setState({ error: null, errorInfo: null }); window.location.reload() }} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Reload</button>
      </div>
    )
    return this.props.children
  }
}

function DesktopPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  if (!id || !token) {
    return <div className="flex items-center justify-center h-screen bg-black text-white">Missing agent ID or token</div>
  }

  return <RemoteDesktop agentId={id} token={token} />
}

function App() {
  return (
    <BrowserRouter>
      <ClientProvider>
        <WebSocketProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={AuthContext.isAuthenticated() ? <Navigate to="/dashboard" /> : <Login />} />
              <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
              <Route path="/devices" element={<AppLayout><DeviceList /></AppLayout>} />
              <Route path="/device/:id" element={<AppLayout><DeviceDetail /></AppLayout>} />
              <Route path="/desktop/:id" element={<DesktopPage />} />
              <Route path="/scripts" element={<AppLayout><ScriptLibrary /></AppLayout>} />
              <Route path="/alerts" element={<AppLayout><AlertPanel /></AppLayout>} />
              <Route path="/patches" element={<AppLayout><PatchManager /></AppLayout>} />
              <Route path="/automation" element={<AppLayout><AutomationBuilder /></AppLayout>} />
              <Route path="/reports" element={<AppLayout><Reports /></AppLayout>} />
              <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
              <Route path="/clients" element={<AppLayout><Clients /></AppLayout>} />
              <Route path="/audit" element={<AppLayout><AuditLog /></AppLayout>} />
              <Route path="/install" element={<AppLayout><InstallAgent /></AppLayout>} />
              <Route path="/ai" element={<AppLayout><AICopilot /></AppLayout>} />
              <Route path="/users" element={<AppLayout><UserManagement /></AppLayout>} />
              <Route path="/" element={<Navigate to="/dashboard" />} />
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          </ErrorBoundary>
        </WebSocketProvider>
      </ClientProvider>
    </BrowserRouter>
  )
}

export default App