/**
 * RemoteDesktop Service — handles built-in remote desktop via WebSocket relay
 */

class RemoteDesktopService {
  /** Base API path for remote desktop endpoints */
  private API_BASE = '/desktop'

  /**
   * Get the WebSocket URL for a remote desktop session.
   */
  getWebSocketUrl(agentId: string, token: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/ws/desktop/${agentId}/?token=${token}`
  }

  /**
   * Navigate to the remote desktop page for a device.
   */
  openDesktop(agentId: string): void {
    window.open(`/desktop/${agentId}`, '_blank')
  }

  /**
   * Start a desktop session via REST (returns session info).
   */
  async startSession(agentId: string): Promise<any> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${this.API_BASE}/start/?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to start remote desktop session')
    }
    return res.json()
  }

  /**
   * Stop a desktop session.
   */
  async stopSession(agentId: string): Promise<void> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${this.API_BASE}/stop/?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to stop remote desktop session')
    }
  }
}

export const remoteDesktop = new RemoteDesktopService()
export default remoteDesktop