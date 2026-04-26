/**
 * RemoteDesktop Service — handles WebRTC remote desktop via signaling WebSocket + TURN credentials
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
   * Fetch TURN credentials for WebRTC.
   */
  async getTurnCredentials(): Promise<{ username: string; password: string; urls: string[] }> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${this.API_BASE}/turn-credentials/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to get TURN credentials')
    }
    return res.json()
  }
}

export const remoteDesktop = new RemoteDesktopService()
export default remoteDesktop