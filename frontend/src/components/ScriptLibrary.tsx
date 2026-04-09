import { useState, useEffect } from 'react'
import type { Script } from '../types/script'
import aiService from '../services/aiService'

const ScriptLibrary = () => {
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    loadScripts()
  }, [])

  const loadScripts = async () => {
    try {
      setLoading(true)
      // Mock data for now
      const mockScripts: Script[] = [
        {
          id: '1',
          name: 'Check Disk Space',
          description: 'Returns available disk space on all drives',
          language: 'powershell',
          content: 'Get-Volume | Select-Object DriveLetter, FileSystemLabel, SizeRemaining, Size',
          category: 'system',
          author: 'System',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Restart Service',
          description: 'Restarts a specified Windows service',
          language: 'powershell',
          content: 'param($ServiceName)\nRestart-Service -Name $ServiceName -Force',
          category: 'system',
          author: 'System',
          createdAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: 'Update Packages',
          description: 'Updates all installed packages',
          language: 'bash',
          content: 'apt-get update && apt-get upgrade -y',
          category: 'maintenance',
          author: 'System',
          createdAt: new Date().toISOString(),
        },
      ]
      setScripts(mockScripts)
    } catch (error) {
      console.error('Failed to load scripts:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateScript = async () => {
    if (!generatePrompt.trim()) return
    
    setGenerating(true)
    try {
      const result = await aiService.generateScript(generatePrompt, 'windows', 'powershell')
      if (result.script) {
        const newScript: Script = {
          id: Date.now().toString(),
          name: `Generated: ${generatePrompt.slice(0, 30)}...`,
          description: generatePrompt,
          language: 'powershell',
          content: result.script,
          category: 'generated',
          author: 'AI',
          createdAt: new Date().toISOString(),
        }
        setScripts(prev => [newScript, ...prev])
        setShowGenerateModal(false)
        setGeneratePrompt('')
      }
    } catch (error) {
      console.error('Failed to generate script:', error)
    } finally {
      setGenerating(false)
    }
  }

  const categories = ['all', 'system', 'maintenance', 'security', 'network', 'generated']

  const filteredScripts = scripts.filter(script => {
    const matchesSearch = script.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         script.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || script.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const getLanguageIcon = (language: string) => {
    switch (language) {
      case 'powershell': return '🪟'
      case 'bash': return '🐧'
      case 'python': return '🐍'
      default: return '📝'
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Script Library</h2>
          <button
            onClick={() => setShowGenerateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <span>✨</span>
            <span>Generate with AI</span>
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 space-y-4">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search scripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg text-sm ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Scripts List */}
        <div className="divide-y divide-gray-200">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : filteredScripts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No scripts found
            </div>
          ) : (
            filteredScripts.map((script) => (
              <div key={script.id} className="p-6 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getLanguageIcon(script.language)}</span>
                      <h3 className="text-lg font-semibold text-gray-900">{script.name}</h3>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                        {script.category}
                      </span>
                    </div>
                    <p className="mt-1 text-gray-600">{script.description}</p>
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span>By {script.author}</span>
                      <span>•</span>
                      <span>{new Date(script.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                      Run
                    </button>
                    <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-semibold">Generate Script with AI</h3>
            </div>
            <div className="p-6">
              <textarea
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="Describe what you want the script to do... (e.g., 'Check if Windows Defender is running and restart it if not')"
                className="w-full h-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="mt-2 text-sm text-gray-500">
                The AI will generate a PowerShell script based on your description.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={generateScript}
                disabled={generating || !generatePrompt.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? 'Generating...' : 'Generate Script'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScriptLibrary
