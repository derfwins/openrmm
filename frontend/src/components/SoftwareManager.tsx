import { useState, useEffect } from 'react'
import type { SoftwarePackage, ThirdPartyPatchPolicy, PatchSource } from '../types/software'

const SoftwareManager = () => {
  const [software, setSoftware] = useState<SoftwarePackage[]>([])
  const [policies, setPolicies] = useState<ThirdPartyPatchPolicy[]>([])
  const [sources, setSources] = useState<PatchSource[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inventory' | 'updates' | 'policies' | 'sources'>('inventory')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  useEffect(() => {
    loadSoftware()
  }, [])

  const loadSoftware = async () => {
    try {
      setLoading(true)
      // Mock data for third-party software
      const mockSoftware: SoftwarePackage[] = [
        {
          id: 'chrome',
          name: 'Google Chrome',
          publisher: 'Google',
          version: '120.0.6099.217',
          installedVersion: '119.0.6045.159',
          latestVersion: '120.0.6099.217',
          category: 'browser',
          platform: 'windows',
          source: 'chocolatey',
          icon: '🌐',
          updateAvailable: true,
          autoUpdate: true,
        },
        {
          id: 'firefox',
          name: 'Mozilla Firefox',
          publisher: 'Mozilla',
          version: '121.0',
          installedVersion: '121.0',
          latestVersion: '121.0',
          category: 'browser',
          platform: 'windows',
          source: 'chocolatey',
          icon: '🦊',
          updateAvailable: false,
          autoUpdate: true,
        },
        {
          id: 'vscode',
          name: 'Visual Studio Code',
          publisher: 'Microsoft',
          version: '1.85.1',
          installedVersion: '1.84.2',
          latestVersion: '1.85.1',
          category: 'development',
          platform: 'windows',
          source: 'chocolatey',
          icon: '📝',
          updateAvailable: true,
          autoUpdate: false,
        },
        {
          id: '7zip',
          name: '7-Zip',
          publisher: 'Igor Pavlov',
          version: '23.01',
          installedVersion: '23.01',
          latestVersion: '23.01',
          category: 'utility',
          platform: 'windows',
          source: 'chocolatey',
          icon: '📦',
          updateAvailable: false,
          autoUpdate: true,
        },
      ]

      const mockPolicies: ThirdPartyPatchPolicy[] = [
        {
          id: '1',
          name: 'Browsers Auto-Update',
          description: 'Automatically update Chrome, Firefox, Edge',
          enabled: true,
          softwareCategories: ['browser'],
          autoUpdate: true,
          autoUpdateSeverity: ['critical', 'high'],
          maintenanceWindow: {
            enabled: true,
            days: ['Saturday'],
            startTime: '02:00',
            endTime: '04:00',
          },
          excludePackages: [],
          requireApproval: false,
        },
      ]

      const mockSources: PatchSource[] = [
        { id: 'choco', name: 'Chocolatey', type: 'chocolatey', enabled: true, status: 'active', lastSyncTime: new Date().toISOString() },
        { id: 'winget', name: 'Windows Package Manager', type: 'winget', enabled: true, status: 'active', lastSyncTime: new Date().toISOString() },
      ]

      setSoftware(mockSoftware)
      setPolicies(mockPolicies)
      setSources(mockSources)
    } catch (error) {
      console.error('Failed to load software:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateSoftware = async (softwareId: string) => {
    console.log('Updating software:', softwareId)
    // TODO: Implement update via Tactical RMM
  }

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      browser: '🌐',
      security: '🛡️',
      productivity: '💼',
      development: '💻',
      media: '🎬',
      utility: '🛠️',
      other: '📋',
    }
    return icons[category] || '📦'
  }

  const filteredSoftware = selectedCategory === 'all' 
    ? software 
    : software.filter(s => s.category === selectedCategory)

  const updatesAvailable = software.filter(s => s.updateAvailable)

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Software Inventory</h2>
            <p className="text-gray-600 mt-1">Manage third-party applications across devices</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('updates')}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 relative"
            >
              Updates Available
              {updatesAvailable.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  {updatesAvailable.length}
                </span>
              )}
            </button>
            <button
              onClick={() => {}}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              🔍 Scan Inventory
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-200">
          <div className="flex gap-6">
            {['inventory', 'updates', 'policies', 'sources'].map((tab) => (
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
              {activeTab === 'inventory' && (
                <>
                  {/* Category Filter */}
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`px-4 py-2 rounded-lg text-sm ${
                        selectedCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      All
                    </button>
                    {['browser', 'security', 'productivity', 'development', 'media', 'utility'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2 rounded-lg text-sm capitalize ${
                          selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Software Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSoftware.map((pkg) => (
                      <div key={pkg.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{pkg.icon || getCategoryIcon(pkg.category)}</span>
                            <div>
                              <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
                              <p className="text-sm text-gray-500">{pkg.publisher}</p>
                            </div>
                          </div>
                          {pkg.updateAvailable && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                              Update
                            </span>
                          )}
                        </div>
                        <div className="mt-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Installed:</span>
                            <span className={pkg.updateAvailable ? 'text-orange-600' : 'text-green-600'}>
                              {pkg.installedVersion}
                            </span>
                          </div>
                          {pkg.updateAvailable && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Latest:</span>
                              <span className="text-green-600">{pkg.latestVersion}</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex gap-2">
                          {pkg.updateAvailable ? (
                            <button
                              onClick={() => updateSoftware(pkg.id)}
                              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                            >
                              Update Now
                            </button>
                          ) : (
                            <span className="flex-1 px-3 py-2 bg-green-50 text-green-700 rounded text-sm text-center">
                              ✓ Up to date
                            </span>
                          )}
                          <button className="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">
                            Details
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {activeTab === 'updates' && (
                <div className="space-y-4">
                  {updatesAvailable.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">✅</div>
                      <h3 className="text-lg font-semibold text-gray-900">All Software Up to Date</h3>
                      <p className="text-gray-500">No updates available</p>
                    </div>
                  ) : (
                    updatesAvailable.map((pkg) => (
                      <div key={pkg.id} className="border border-orange-200 bg-orange-50 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{pkg.icon}</span>
                            <div>
                              <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
                              <p className="text-sm text-gray-600">
                                {pkg.installedVersion} → {pkg.latestVersion}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => updateSoftware(pkg.id)}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Update
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'policies' && (
                <div className="space-y-4">
                  {policies.map((policy) => (
                    <div key={policy.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{policy.name}</h3>
                            <span className={`px-2 py-1 text-xs rounded ${
                              policy.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {policy.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-gray-600 mt-1">{policy.description}</p>
                          <div className="mt-2 text-sm text-gray-500">
                            <p>Categories: {policy.softwareCategories.join(', ')}</p>
                            <p>Auto-update: {policy.autoUpdate ? 'Yes' : 'No'}</p>
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

              {activeTab === 'sources' && (
                <div className="space-y-4">
                  {sources.map((source) => (
                    <div key={source.id} className="border border-gray-200 rounded-lg p-4 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${
                          source.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                        }`} />
                        <div>
                          <h3 className="font-semibold text-gray-900">{source.name}</h3>
                          <p className="text-sm text-gray-500 capitalize">{source.type}</p>
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        {source.lastSyncTime && (
                          <p>Last sync: {new Date(source.lastSyncTime).toLocaleString()}</p>
                        )}
                        {source.status === 'error' && source.errorMessage && (
                          <p className="text-red-600">{source.errorMessage}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SoftwareManager
