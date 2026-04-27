import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import wsService from '../services/websocketService'

interface WSContextType {
  connected: boolean
  lastEvent: unknown | null
  subscribe: (channel: string, handler: (data: unknown) => void) => () => void
}

const WebSocketContext = createContext<WSContextType | undefined>(undefined)

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const [connected, setConnected] = useState(wsService.connected)
  const [lastEvent, setLastEvent] = useState<unknown | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      wsService.connect(token)
    }

    const unsubConnect = wsService.onConnectionChange((isConnected) => {
      setConnected(isConnected)
    })

    const unsubWildcard = wsService.subscribe('*', (data) => {
      setLastEvent(data)
    })

    // Listen for login event to connect WebSocket after auth
    const onLogin = () => {
      const token = localStorage.getItem('token')
      if (token) wsService.connect(token)
    }

    // Listen for logout event to disconnect
    const onLogout = () => {
      wsService.disconnect()
    }

    window.addEventListener('auth-login', onLogin)
    window.addEventListener('auth-logout', onLogout)

    return () => {
      unsubConnect()
      unsubWildcard()
      wsService.disconnect()
      window.removeEventListener('auth-login', onLogin)
      window.removeEventListener('auth-logout', onLogout)
    }
  }, [])

  const subscribe = useCallback((channel: string, handler: (data: unknown) => void) => {
    return wsService.subscribe(channel, handler)
  }, [])

  return (
    <WebSocketContext.Provider value={{ connected, lastEvent, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}