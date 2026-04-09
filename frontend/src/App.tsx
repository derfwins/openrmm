import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import Login from './components/Login'
import DeviceDetail from './components/DeviceDetail'
import ScriptLibrary from './components/ScriptLibrary'
import AlertPanel from './components/AlertPanel'
import Sidebar from './components/Sidebar'

// Layout wrapper for authenticated pages
const AuthenticatedLayout = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = () => {
    return localStorage.getItem('token') !== null
  }

  if (!isAuthenticated()) {
    return <Navigate to="/login" />
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}

function App() {
  const isAuthenticated = () => {
    return localStorage.getItem('token') !== null
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={isAuthenticated() ? <Navigate to="/dashboard" /> : <Login />} 
        />
        <Route 
          path="/dashboard" 
          element={isAuthenticated() ? <Dashboard /> : <Navigate to="/login" />} 
        />
        
        <Route 
          path="/device/:id" 
          element={isAuthenticated() ? <DeviceDetail /> : <Navigate to="/login" />} 
        />
        
        <Route 
          path="/scripts" 
          element={<AuthenticatedLayout>
            <div className="p-6">
              <ScriptLibrary />
            </div>
          </AuthenticatedLayout>
          } 
        />
        
        <Route 
          path="/alerts" 
          element={<AuthenticatedLayout>
            <div className="p-6">
              <AlertPanel />
            </div>
          </AuthenticatedLayout>
          } 
        />
        
        <Route 
          path="/" 
          element={<Navigate to="/dashboard" />} 
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
