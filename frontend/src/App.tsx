import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import Login from './components/Login'
import DeviceDetail from './components/DeviceDetail'

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
          path="/" 
          element={<Navigate to="/dashboard" />} 
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
