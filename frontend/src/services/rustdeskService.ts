/**
 * RustDesk Service — handles remote access via RustDesk server
 */
class RustDeskService {
  /** Base API path for RustDesk endpoints */
  private API_BASE = '/rustdesk/api'

  /**
   * Get the RustDesk server public key for agent configuration.
   */
  async getServerKey(): Promise<string> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${this.API_BASE}/server-key/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to get RustDesk server key')
    }
    const data = await res.json()
    return data.public_key
  }

  /**
   * Open a RustDesk remote session for a device.
   * Generates a one-time connection password and opens the RustDesk client.
   */
  async openRemote(peerId: string): Promise<string | null> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    try {
      const res = await fetch(`${this.API_BASE}/session/?peer_id=${encodeURIComponent(peerId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to create RustDesk session')
      }
      const data = await res.json()

      // Open RustDesk client via rustdesk:// protocol handler
      const serverUrl = data.server_url || window.location.hostname
      const password = data.password || ''
      const key = data.key || ''
      const url = `rustdesk://${peerId}@${serverUrl}?password=${password}&key=${encodeURIComponent(key)}`
      window.open(url, '_blank')
      return url
    } catch (e: any) {
      console.error('Failed to open RustDesk remote:', e)
      throw e
    }
  }

  /** Open remote desktop (same as openRemote, alias for UI clarity) */
  async openDesktop(rustdeskId?: string, _agentId?: string): Promise<void> {
    if (!rustdeskId) throw new Error('No RustDesk ID linked. Install the RustDesk agent on this device first.')
    await this.openRemote(rustdeskId)
  }

  /** Open terminal session (same as openRemote, RustDesk handles all modes) */
  async openTerminal(rustdeskId?: string, _agentId?: string): Promise<void> {
    if (!rustdeskId) throw new Error('No RustDesk ID linked. Install the RustDesk agent on this device first.')
    await this.openRemote(rustdeskId)
  }

  /** Open file transfer (same as openRemote, RustDesk handles all modes) */
  async openFiles(rustdeskId?: string, _agentId?: string): Promise<void> {
    if (!rustdeskId) throw new Error('No RustDesk ID linked. Install the RustDesk agent on this device first.')
    await this.openRemote(rustdeskId)
  }

  /**
   * Get the RustDesk server address for agent installation.
   */
  getServerAddress(): string {
    return window.location.hostname
  }

  /**
   * Get the install command for RustDesk agent.
   */
  async getInstallCommand(osType: 'windows' | 'linux' | 'macos' = 'windows'): Promise<any> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${this.API_BASE}/install-command/?os_type=${osType}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to get install command')
    }
    return res.json()
  }

  /**
   * Push RustDesk install command to an agent.
   * Sends a POST request to install RustDesk on the remote device.
   */
  async pushInstall(agentId: string): Promise<any> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${this.API_BASE}/install-push/?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to push RustDesk install')
    }
    return res.json()
  }

  /**
   * Link a RustDesk peer ID and optional password to an agent.
   */
  async linkPeerId(agentId: string, rustdeskId: string, password?: string): Promise<any> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    let url = `/agents/${encodeURIComponent(agentId)}/rustdesk-id/?rustdesk_id=${encodeURIComponent(rustdeskId)}`
    if (password) {
      url += `&rustdesk_password=${encodeURIComponent(password)}`
    }
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to link RustDesk peer ID')
    }
    return res.json()
  }

  /**
   * Set or update the permanent password for RustDesk unattended access.
   */
  async setPassword(agentId: string, password: string): Promise<any> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`/agents/${encodeURIComponent(agentId)}/rustdesk-password/`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to set RustDesk password')
    }
    return res.json()
  }

  /**
   * Check if RustDesk is installed and the peer is online.
   */
  async getStatus(agentId: string): Promise<{
    installed: boolean
    peer_id: string | null
    peer_online: boolean
    peer_info: any | null
    has_password: boolean
  }> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${this.API_BASE}/status/?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to check RustDesk status')
    }
    return res.json()
  }
}

export const rustDesk = new RustDeskService()
export default rustDesk