// Apache Guacamole API Service
// Handles remote desktop connections via Guacamole Gateway

const GUACAMOLE_API_URL = import.meta.env.VITE_GUACAMOLE_API_URL || 'http://localhost:8080'
const GUACAMOLE_PROXY_URL = import.meta.env.VITE_GUACAMOLE_PROXY_URL || 'wss://localhost:8443'

export interface GuacamoleConnection {
  id: string
  name: string
  protocol: 'rdp' | 'vnc' | 'ssh'
  hostname: string
  port: number
  username?: string
  password?: string
  domain?: string
  security?: 'any' | 'rdp' | 'tls' | 'nla'
  'ignore-cert'?: boolean
  'enable-drive'?: boolean
  'drive-path'?: string
  'enable-audio'?: boolean
  'enable-printing'?: boolean
}

export interface GuacamoleSession {
  id: string
  connectionId: string
  connectionName: string
  startTime: string
  status: 'active' | 'disconnected' | 'error'
  websocketUrl: string
}

export interface GuacamoleUser {
  username: string
  password?: string
  attributes?: {
    'guac-full-name'?: string
    'guac-email-address'?: string
    'guac-organization'?: string
    'guac-organizational-role'?: string
  }
}

class GuacamoleService {
  private token: string = ''

  // Authenticate with Guacamole API
  async authenticate(username: string, password: string): Promise<string> {
    const response = await fetch(`${GUACAMOLE_API_URL}/api/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username,
        password,
      }),
    })

    if (!response.ok) {
      throw new Error('Authentication failed')
    }

    const data = await response.json()
    this.token = data.authToken
    return this.token
  }

  // Get authentication token for WebSocket
  getAuthToken(): string | null {
    return this.token || null
  }

  // Create a new connection
  async createConnection(connection: Omit<GuacamoleConnection, 'id'>): Promise<GuacamoleConnection> {
    if (!this.token) throw new Error('Not authenticated')

    const response = await fetch(`${GUACAMOLE_API_URL}/api/session/data/mysql/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Guacamole-Token': this.token,
      },
      body: JSON.stringify({
        name: connection.name,
        parentIdentifier: 'ROOT',
        protocol: connection.protocol,
        attributes: {
          'max-connections': '10',
          'max-connections-per-user': '5',
        },
        parameters: {
          hostname: connection.hostname,
          port: connection.port.toString(),
          username: connection.username || '',
          password: connection.password || '',
          domain: connection.domain || '',
          security: connection.security || 'any',
          'ignore-cert': connection['ignore-cert'] ? 'true' : 'false',
          'enable-drive': connection['enable-drive'] ? 'true' : 'false',
          'enable-audio': connection['enable-audio'] ? 'true' : 'false',
          'enable-printing': connection['enable-printing'] ? 'true' : 'false',
        },
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to create connection')
    }

    return await response.json()
  }

  // Get all connections
  async getConnections(): Promise<GuacamoleConnection[]> {
    if (!this.token) throw new Error('Not authenticated')

    const response = await fetch(
      `${GUACAMOLE_API_URL}/api/session/data/mysql/connections`,
      {
        headers: {
          'Guacamole-Token': this.token,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch connections')
    }

    return await response.json()
  }

  // Get active sessions
  async getActiveSessions(): Promise<GuacamoleSession[]> {
    if (!this.token) throw new Error('Not authenticated')

    const response = await fetch(
      `${GUACAMOLE_API_URL}/api/session/data/mysql/activeConnections`,
      {
        headers: {
          'Guacamole-Token': this.token,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch sessions')
    }

    return await response.json()
  }

  // Start a connection and get WebSocket URL
  async startConnection(connectionId: string): Promise<GuacamoleSession> {
    if (!this.token) throw new Error('Not authenticated')

    // Get connection details
    const response = await fetch(
      `${GUACAMOLE_API_URL}/api/session/data/mysql/connections/${connectionId}`,
      {
        headers: {
          'Guacamole-Token': this.token,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to get connection')
    }

    const connection = await response.json()

    // Generate WebSocket URL for this connection
    const wsToken = btoa(`${connectionId}\0c\0${this.token}`)
    const websocketUrl = `${GUACAMOLE_PROXY_URL}/guacamole/websocket-tunnel?token=${wsToken}&GUAC_DATA_SOURCE=mysql&GUAC_ID=${connectionId}&GUAC_TYPE=c&GUAC_TIME=${Date.now()}`

    return {
      id: `session-${Date.now()}`,
      connectionId,
      connectionName: connection.name,
      startTime: new Date().toISOString(),
      status: 'active',
      websocketUrl,
    }
  }

  // Kill a session
  async killSession(sessionId: string): Promise<void> {
    if (!this.token) throw new Error('Not authenticated')

    const response = await fetch(
      `${GUACAMOLE_API_URL}/api/session/data/mysql/activeConnections/${sessionId}`,
      {
        method: 'DELETE',
        headers: {
          'Guacamole-Token': this.token,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to kill session')
    }
  }

  // Get connection history
  async getConnectionHistory(connectionId: string): Promise<any[]> {
    if (!this.token) throw new Error('Not authenticated')

    const response = await fetch(
      `${GUACAMOLE_API_URL}/api/session/data/mysql/connectionHistory?connection=${connectionId}`,
      {
        headers: {
          'Guacamole-Token': this.token,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch history')
    }

    return await response.json()
  }

  // Logout
  logout(): void {
    this.token = ''
  }
}

export const guacamoleService = new GuacamoleService()
export default guacamoleService