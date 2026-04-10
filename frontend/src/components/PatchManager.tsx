import { useState, useEffect } from 'react'
import type { Patch, DevicePatch, PatchPolicy } from '../types/patch'

const PatchManager = () => {
  const [patches, setPatches] = useState<Patch[]>([])
  const [_devicePatches, _setDevicePatches] = useState<DevicePatch[]>([])
  const [policies, setPolicies] = useState<PatchPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'patches' | 'policies' | 'history'>('overview')
  const [_selectedDevice, _setSelectedDevice] = useState<string>('all')
  const [_showPolicyModal, _setShowPolicyModal] = useState(false)

  useEffect(() => {
    loadPatches()
  }, [])

  const loadPatches = async () => {
    try {
      setLoading(true)
      // Mock data for now - will connect to Tactical RMM patch API
      const mockPatches: Patch[] = [
        {
          id: 'KB5028185',
          name: 'Cumulative Update for Windows 11',
          description: 'Security update addressing critical vulnerabilities',
          severity: 'critical',
          category: 'security',
          platform: 'windows',
          version: '2024-07',
          releaseDate: new Date().toISOString(),
          rebootRequired: true,
          size: '487 MB',
        },
        {
          id: 'KB5027293',
          name: '.NET Framework Security Update',
          description: 'Security and quality rollup',
          severity: 'important',
          category: 'security',
          platform: 'windows',
          version: '4.8.1',
          releaseDate: new Date(Date.now() - 86400000).toISOString(),
          rebootRequired: false,
          size: '45 MB',
        },
      ]

      const mockPolicies: PatchPolicy[] = [
        {
          id: '1',
          name: 'Critical Auto-Install',
          description: 'Automatically install critical patches',
          autoApproveSeverity: ['critical'],
          autoInstallTime: '02:00',
          rebootBehavior: 'automatic',
          maintenanceWindow: {
            enabled: true,
            days: ['Saturday', 'Sunday'],
            startTime: '02:00',
            endTime: '06:00',
          },
        },
      ]

      setPatches(mockPatches)
      setPolicies(mockPolicies)
    } catch (error) {
      console.error('Failed to load patches:', error)
    } finally {
      setLoading(false)
    }
  }

  const scanForPatches = async (deviceId: string) => {
    console.log('Scanning device:', deviceId, 'for patches...')
    // TODO: Implement patch scan via Tactical RMM API
  }

  const installPatch = async (patchId: string, deviceId: string) => {
    console.log('Installing patch:', patchId, 'on device:', deviceId)
    // TODO: Implement patch install via Tactical RMM API
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200'
      case 'important': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴'
      case 'important': return '🟠'
      case 'moderate': return '🟡'
      case 'low': return '🔵'
      default: return '⚪'
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Patch Management</h2>
            <p className="text-gray-600 mt-1">Manage system updates across all devices</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => scanForPatches(_selectedDevice)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              🔍 Scan for Updates
            </button>
            <button
              onClick={() => _setShowPolicyModal(true)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              ⚙️ Policies
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-200">
          <div className="flex gap-6">
            {['overview', 'patches', 'policies', 'history'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-4 text-sm font-medium border-b-2 ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-red-50 p-6 rounded-lg border border-red-200">
                    <div className="text-3xl font-bold text-red-600">12</div>
                    <div className="text-red-800">Critical</div>
                  </div>
                  <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
                    <div className="text-3xl font-bold text-orange-600">28</div>
                    <div className="text-orange-800">Important</div>
                  </div>
                  <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                    <div className="text-3xl font-bold text-yellow-600">45</div>
                    <div className="text-yellow-800">Moderate</div>
                  </div>
                  <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                    <div className="text-3xl font-bold text-blue-600">8</div>
                    <div className="text-blue-800">Low</div>
                  </div>
                </div>
              )}

              {activeTab === 'patches' && (
                <div className="divide-y divide-gray-200">
                  {patches.map((patch) => (
                    <div key={patch.id} className="py-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span>{getSeverityIcon(patch.severity)}</span>
                            <h3 className="font-semibold text-gray-900">{patch.name}</h3>
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded border ${getSeverityColor(
                                patch.severity
                              )}`}
                            >
                              {patch.severity.toUpperCase()}
                            </span>
                            {patch.rebootRequired && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                                🔄 Reboot Required
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-gray-600">{patch.description}</p>
                          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                            <span>ID: {patch.id}</span>
                            <span>•</span>
                            <span>{patch.size}</span>
                            <span>•</span>
                            <span>{new Date(patch.releaseDate).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => installPatch(patch.id, _selectedDevice)}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Install
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'policies' && (
                <div className="space-y-4">
                  {policies.map((policy) => (
                    <div key={policy.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-900">{policy.name}</h3>
                          <p className="text-gray-600">{policy.description}</p>
                          <div className="mt-2 text-sm text-gray-500">
                            <div>Auto-approve: {policy.autoApproveSeverity.join(', ')}</div>
                            <div>Install time: {policy.autoInstallTime}</div>
                            <div>Reboot: {policy.rebootBehavior}</div>
                            {policy.maintenanceWindow.enabled && (
                              <div>
                                Window: {policy.maintenanceWindow.days.join(', ')} {' '}
                                {policy.maintenanceWindow.startTime}-{policy.maintenanceWindow.endTime}
                              </div>
                            )}
                          </div>
                        </div>
                        <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="text-center text-gray-500 py-12">
                  Installation history will appear here
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PatchManager
