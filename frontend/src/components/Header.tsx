import { useState } from 'react'

interface HeaderProps {
  title: string
}

const Header = ({ title }: HeaderProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [showAI, setShowAI] = useState(false)

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          
          <div className="relative">
            <input
              type="text"
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="global-search"
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowAI(!showAI)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <span>🤖</span>
            <span>AI Copilot</span>
          </button>

          <div className="flex items-center gap-3">
            <button className="p-2 text-gray-500 hover:text-gray-700 relative">
              <span className="text-xl">🔔</span>
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                F
              </div>
              <span className="text-sm font-medium text-gray-700">fred@derfwins.com</span>
            </div>
          </div>
        </div>
      </div>

      {showAI && (
        <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🤖</span>
            <span className="font-semibold text-purple-900">AI Copilot is ready</span>
          </div>
          <p className="text-sm text-purple-700 mb-3">
            Ask me anything about your devices, scripts, or automation workflows.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Example: Show me offline servers in the last hour"
              className="flex-1 px-4 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
            <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              Ask
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

export default Header
