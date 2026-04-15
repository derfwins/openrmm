// Real-time WebSocket service for OpenRMM
// Auto-reconnects with exponential backoff, heartbeat, message queuing

import { API_BASE_URL } from '../config'

type MessageHandler = (data: unknown) => void
type ConnectionHandler = (connected: boolean) => void

interface WSMessage {
  type: string
  channel: string
  data: unknown
  timestamp: string
}

class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectDelay = 30000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private messageQueue: string[] = []
  private subscriptions: Map<string, Set<MessageHandler>> = new Map()
  private connectionCallbacks: Set<ConnectionHandler> = new Set()
  private token: string | null = null
  private intentionalClose = false

  connect(token?: string) {
    if (token) this.token = token
    if (!this.token) {
      this.token = localStorage.getItem('token')
    }
    if (!this.token) return

    this.intentionalClose = false
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = API_BASE_URL.replace(/^https?:\/\//, '').replace(/:\d+$/, '')
    const wsUrl = `${protocol}//${host}/ws/?token=${this.token}`

    try {
      this.ws = new WebSocket(wsUrl)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.flushQueue()
      this.connectionCallbacks.forEach(cb => cb(true))
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        const handlers = this.subscriptions.get(msg.channel)
        if (handlers) {
          handlers.forEach(handler => handler(msg.data))
        }
        // Also notify wildcard subscribers
        const wildcardHandlers = this.subscriptions.get('*')
        if (wildcardHandlers) {
          wildcardHandlers.forEach(handler => handler(msg))
        }
      } catch {
        // Non-JSON message, ignore
      }
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      this.connectionCallbacks.forEach(cb => cb(false))
      if (!this.intentionalClose) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // onclose will handle reconnect
    }
  }

  disconnect() {
    this.intentionalClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  subscribe(channel: string, handler: MessageHandler): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set())
    }
    this.subscriptions.get(channel)!.add(handler)
    return () => {
      const handlers = this.subscriptions.get(channel)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.subscriptions.delete(channel)
        }
      }
    }
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionCallbacks.add(handler)
    return () => {
      this.connectionCallbacks.delete(handler)
    }
  }

  send(type: string, channel: string, data: unknown) {
    const msg = JSON.stringify({ type, channel, data, timestamp: new Date().toISOString() })
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg)
    } else {
      this.messageQueue.push(msg)
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private flushQueue() {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.messageQueue.shift()!)
    }
  }
}

export const wsService = new WebSocketService()
export default wsService