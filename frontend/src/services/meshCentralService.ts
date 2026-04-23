class MeshCentralService {
  /** Base API path for MeshCentral endpoints */
  private API_BASE = '/mesh/api'

  /**
   * Get a direct session URL for a specific MeshCentral device.
   * Opens in a new tab for remote desktop, terminal, or files access.
   *
   * @param deviceId - The mesh_node_id from the agent record
   * @param viewmode - 12 = desktop, 3 = terminal, 4 = files
   * @returns URL that auto-logins to MeshCentral with the specified device view
   */
  async getDeviceSession(deviceId: string, viewmode: number = 12): Promise<string | null> {
    try {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams({
        device_id: deviceId,
        viewmode: String(viewmode),
      })

      const response = await fetch(`${this.API_BASE}/session/?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        console.error('Failed to get MeshCentral session:', response.status, response.statusText)
        return null
      }

      const data = await response.json()
      return data.url || null
    } catch (error) {
      console.error('Error getting MeshCentral session:', error)
      return null
    }
  }

  /**
   * Open a remote desktop session in a new browser tab.
   */
  async openDesktop(deviceId: string): Promise<void> {
    const url = await this.getDeviceSession(deviceId, 12)
    if (url) {
      window.open(url, '_blank')
    } else {
      alert('Failed to start remote desktop session. Please try again.')
    }
  }

  /**
   * Open a terminal/SSH session in a new browser tab.
   */
  async openTerminal(deviceId: string): Promise<void> {
    const url = await this.getDeviceSession(deviceId, 3)
    if (url) {
      window.open(url, '_blank')
    } else {
      alert('Failed to start terminal session. Please try again.')
    }
  }

  /**
   * Open a file browser session in a new browser tab.
   */
  async openFiles(deviceId: string): Promise<void> {
    const url = await this.getDeviceSession(deviceId, 4)
    if (url) {
      window.open(url, '_blank')
    } else {
      alert('Failed to start file browser session. Please try again.')
    }
  }

  /**
   * Get a general SSO token for MeshCentral (opens the full MeshCentral UI).
   */
  async getToken(): Promise<string | null> {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${this.API_BASE}/token/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) return null

      const data = await response.json()
      return data.url || null
    } catch (error) {
      console.error('Error getting MeshCentral token:', error)
      return null
    }
  }
}

export default new MeshCentralService()