// Guacamole Remote Desktop Service
// All URLs are relative — nginx proxies /guacamole/ to the Guacamole container

const GUACAMOLE_BASE = '/guacamole'

export interface GuacamoleSession {
  id: string
  connectionId: string
  token: string
  websocketUrl: string
  status: string
}

export const guacamoleService = {
  async getToken(username: string = 'guacadmin', password: string = 'guacadmin') {
    const response = await fetch(`${GUACAMOLE_BASE}/api/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }),
    })

    if (!response.ok) throw new Error('Guacamole auth failed')
    return response.json()
  },

  async getConnections(token: string) {
    const response = await fetch(
      `${GUACAMOLE_BASE}/api/session/data/mysql/connections`,
      {
        headers: { token },
      }
    )
    if (!response.ok) throw new Error('Failed to get connections')
    return response.json()
  },

  async getConnection(token: string, connectionId: string) {
    const response = await fetch(
      `${GUACAMOLE_BASE}/api/session/data/mysql/connections/${connectionId}`,
      {
        headers: { token },
      }
    )
    if (!response.ok) throw new Error('Failed to get connection')
    return response.json()
  },

  async createConnection(params: {
    name: string
    protocol: string
    hostname: string
    port: number
    [key: string]: unknown
  }) {
    const tokenData = await this.getToken()
    const token = tokenData.authToken
    const response = await fetch(
      `${GUACAMOLE_BASE}/api/session/data/mysql/connections`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token,
        },
        body: JSON.stringify({
          name: params.name,
          protocol: params.protocol,
          parameters: {
            hostname: params.hostname,
            port: String(params.port),
            ...Object.fromEntries(
              Object.entries(params).filter(([k]) => !['name', 'protocol', 'hostname', 'port'].includes(k))
            ),
          },
        }),
      }
    )
    if (!response.ok) throw new Error('Failed to create connection')
    return response.json()
  },

  async startConnection(connectionId: string): Promise<GuacamoleSession> {
    const tokenData = await this.getToken()
    const token = tokenData.authToken
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const websocketUrl = `${proto}//${window.location.host}/guacamole/websocket-tunnel?token=${token}&GUAC_DATA_SOURCE=mysql&GUAC_ID=${connectionId}&GUAC_TYPE=c&GUAC_TIME=${Date.now()}`

    return {
      id: `${Date.now()}`,
      connectionId,
      token,
      websocketUrl,
      status: 'connected',
    }
  },

  async getActiveConnections(token: string) {
    const response = await fetch(
      `${GUACAMOLE_BASE}/api/session/data/mysql/activeConnections`,
      {
        headers: { token },
      }
    )
    if (!response.ok) throw new Error('Failed to get active connections')
    return response.json()
  },

  async disconnectConnection(token: string, sessionId: string) {
    const response = await fetch(
      `${GUACAMOLE_BASE}/api/session/data/mysql/activeConnections/${sessionId}`,
      {
        method: 'DELETE',
        headers: { token },
      }
    )
    if (!response.ok) throw new Error('Failed to disconnect')
    return response.json()
  },

  getConnectionUrl(connectionId: string, token: string): string {
    return `${GUACAMOLE_BASE}/#/client/${connectionId}?token=${token}`
  },

  async getConnectionHistory(token: string, connectionId: string) {
    const response = await fetch(
      `${GUACAMOLE_BASE}/api/session/data/mysql/connectionHistory?connection=${connectionId}`,
      {
        headers: { token },
      }
    )
    if (!response.ok) throw new Error('Failed to get connection history')
    return response.json()
  },
}