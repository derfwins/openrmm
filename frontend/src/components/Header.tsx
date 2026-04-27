import { useState } from 'react'
import { IconSearch, IconAI, IconBellDot } from './Icons'

interface HeaderProps {
  title: string
}

const Header = ({ title }: HeaderProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [showAI, setShowAI] = useState(false)

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          
          <div className="relative">
            <input
              type="text"
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="global-search"
              className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
            />
            <span className="absolute left-3 top-2.5 text-gray-400"><IconSearch size={16} /></span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowAI(!showAI)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <IconAI size={16} />
            <span>AI Copilot</span>
          </button>

          <div className="flex items-center gap-3">
            <button className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 relative transition-colors">
              <IconBellDot size={20} />
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                F
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">fred@derfwins.com</span>
            </div>
          </div>
        </div>
      </div>

      {showAI && (
        <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <IconAI size={20} className="text-purple-600 dark:text-purple-400" />
            <span className="font-semibold text-purple-900 dark:text-purple-300">AI Copilot is ready</span>
          </div>
          <p className="text-sm text-purple-700 dark:text-purple-400 mb-3">
            Ask me anything about your devices, scripts, or automation workflows.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Example: Show me offline servers in the last hour"
              className="flex-1 px-4 py-2 border border-purple-300 dark:border-purple-700 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400"
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