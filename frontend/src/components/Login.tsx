import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiService from '../services/apiService'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [twofactor, setTwofactor] = useState('')
  const [show2FA, setShow2FA] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // Step 1: Check credentials, determine if 2FA is needed
  const handleCheckCreds = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await apiService.checkCredentials(username, password)
      if (data.totp === false) {
        // No 2FA set up — checkcreds already logged in and returned token
        localStorage.setItem('token', data.token)
        localStorage.setItem('username', username)
        // Notify ClientProvider to refresh data immediately
        window.dispatchEvent(new Event('auth-login'))
        navigate('/dashboard')
      } else {
        // 2FA required — show the code input
        setShow2FA(true)
      }
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Submit 2FA code
  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await apiService.login(username, password, twofactor || 'sekret')
      localStorage.setItem('username', username)
      // Notify ClientProvider to refresh data immediately
      window.dispatchEvent(new Event('auth-login'))
      navigate('/dashboard')
    } catch {
      setError('Invalid 2FA code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-gray-950">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-60" />
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center mb-8 border border-white/20">
            <span className="text-white text-3xl font-bold">OR</span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4 leading-tight">
            Remote<br/>Management<br/>Made Simple
          </h1>
          <p className="text-lg text-blue-200/80 max-w-md">
            Monitor, manage, and automate your entire infrastructure from one dashboard.
          </p>
          <div className="flex gap-6 mt-12 text-blue-200/60 text-sm">
            <div className="flex items-center gap-2"><span className="w-2 h-2 bg-green-400 rounded-full"></span> Real-time monitoring</div>
            <div className="flex items-center gap-2"><span className="w-2 h-2 bg-blue-400 rounded-full"></span> Patch management</div>
            <div className="flex items-center gap-2"><span className="w-2 h-2 bg-purple-400 rounded-full"></span> AI-powered</div>
          </div>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-xl font-bold">OR</span>
            </div>
            <span className="text-2xl font-bold text-white">OpenRMM</span>
          </div>

          {!show2FA ? (
            <>
              <h2 className="text-3xl font-bold text-white mb-2">Welcome back</h2>
              <p className="text-gray-400 mb-8">Sign in to your account to continue</p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-white mb-2">Two-Factor Auth</h2>
              <p className="text-gray-400 mb-8">Enter the code from your authenticator app</p>
            </>
          )}

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {!show2FA ? (
            <form onSubmit={handleCheckCreds} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Enter your username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-500 hover:to-indigo-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span>
                    Signing in...
                  </span>
                ) : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2FA} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">2FA Code</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={twofactor}
                  onChange={e => setTwofactor(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-center text-lg tracking-[0.5em] font-mono"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-500 hover:to-indigo-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span>
                    Verifying...
                  </span>
                ) : 'Verify'}
              </button>

              <button
                type="button"
                onClick={() => { setShow2FA(false); setTwofactor('') }}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                ← Back to login
              </button>
            </form>
          )}

          <p className="text-center text-gray-500 text-xs mt-8">
            OpenRMM v0.1 · Custom Backend
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login