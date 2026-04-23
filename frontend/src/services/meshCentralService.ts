// Auto-logout on 401
const handleUnauthorized = (res: Response) => {
  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    window.location.href = '/login'
    return true
  }
  return false
}

class MeshCentralService {
  /** Base API path for MeshCentral endpoints */
  private API_BASE = '/mesh/api'

  /**
   * Generate a MeshCentral SSO login token via the OpenRMM backend.
   */
  private async getToken(): Promise<string> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    const res = await fetch(`${this.API_BASE}/token/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (handleUnauthorized(res)) throw new Error('Session expired')
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to get MeshCentral token')
    }
    const data = await res.json()
    return data.token
  }

  /**
   * Get a direct session URL for a specific MeshCentral device.
   * If no meshDeviceId is provided, opens the MeshCentral dashboard.
   */
  private async getSessionUrl(meshDeviceId: string | undefined, viewmode: number): Promise<string> {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')

    // If we have a MeshCentral device ID, open directly to that device
    if (meshDeviceId) {
      const res = await fetch(
        `${this.API_BASE}/session/?device_id=${encodeURIComponent(meshDeviceId)}&viewmode=${viewmode}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (handleUnauthorized(res)) throw new Error('Session expired')
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to get MeshCentral session')
      }
      const data = await res.json()
      return data.url
    }

    // No device linked yet — open MeshCentral dashboard
    const meshToken = await this.getToken()
    return `/mesh/?login=${meshToken}`
  }

  /** Open MeshCentral remote desktop (viewmode=12) */
  async openDesktop(meshDeviceId?: string): Promise<void> {
    try {
      const url = await this.getSessionUrl(meshDeviceId, 12)
      window.open(url, '_blank', 'width=1280,height=800')
    } catch (e: any) {
      console.error('Failed to open MeshCentral desktop:', e)
      alert('Could not open remote desktop: ' + (e.message || 'Unknown error'))
    }
  }

  /** Open MeshCentral terminal (viewmode=11) */
  async openTerminal(meshDeviceId?: string): Promise<void> {
    try {
      const url = await this.getSessionUrl(meshDeviceId, 11)
      window.open(url, '_blank', 'width=1024,height=768')
    } catch (e: any) {
      console.error('Failed to open MeshCentral terminal:', e)
      alert('Could not open terminal: ' + (e.message || 'Unknown error'))
    }
  }

  /** Open MeshCentral file transfer (viewmode=13) */
  async openFiles(meshDeviceId?: string): Promise<void> {
    try {
      const url = await this.getSessionUrl(meshDeviceId, 13)
      window.open(url, '_blank', 'width=1024,height=768')
    } catch (e: any) {
      console.error('Failed to open MeshCentral files:', e)
      alert('Could not open file transfer: ' + (e.message || 'Unknown error'))
    }
  }
}

export const meshCentral = new MeshCentralService()
export default meshCentral