import { useState, useRef, useEffect } from 'react'
import aiService from '../services/aiService'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const AICopilot = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I\'m your OpenRMM AI Copilot. I can help you:\n\n• Analyze device issues\n• Generate scripts\n• Explain system metrics\n• Suggest troubleshooting steps\n\nWhat would you like to do?',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await aiService.askQuestion(userMessage.content)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please check that your AI service is configured in Settings > Integrations.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const quickActions = [
    { icon: '🔍', label: 'Check device health', prompt: 'How do I check if all devices are healthy?' },
    { icon: '📜', label: 'Generate script', prompt: 'Generate a script to check disk space' },
    { icon: '🔔', label: 'View critical alerts', prompt: 'Show me critical alerts from today' },
    { icon: '📊', label: 'Analyze metrics', prompt: 'What does high CPU usage mean?' },
  ]

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xl">🤖</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI Copilot</h2>
            <p className="text-sm text-gray-500">Powered by Groq</p>
          </div>
        </div>
        <button className="p-2 text-gray-400 hover:text-gray-600">
          <span className="text-xl">⚙️</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
              }`}
            >
              {message.role === 'user' ? '👤' : '🤖'}
            </div>
            <div
              className={`max-w-[80%] px-4 py-2 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              <div
                className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-blue-200' : 'text-gray-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center">
              🤖
            </div>
            <div className="bg-gray-100 px-4 py-3 rounded-lg">
              <div className="flex gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></span>
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="px-6 py-3 border-t border-gray-200">
        <div className="flex gap-2 overflow-x-auto">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                setInput(action.prompt)
              }}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 whitespace-nowrap text-sm"
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask me anything about your devices..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg resize-none h-14"
            rows={1}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '...' : '➤'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AICopilot
