import { useState, useRef, useEffect, useCallback } from 'react'
import type { FormEvent } from 'react'
import aiService from '../services/aiService'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

const MAX_MESSAGES = 20
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''

const QUICK_ACTIONS = [
  { label: 'Show offline agents', prompt: 'Show me all offline agents and when they were last seen' },
  { label: 'Generate script', prompt: 'Generate a PowerShell script to clean up temp files and free disk space' },
  { label: 'Check health', prompt: 'Check the overall health status of all managed devices' },
  { label: 'Analyze device', prompt: 'Analyze the most critical device and provide recommendations' },
]

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="relative mt-2 mb-2">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="bg-gray-800 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderContent(content: string) {
  const parts: React.ReactNode[] = []
  const regex = /```(\w*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++} className="whitespace-pre-wrap">{content.slice(lastIndex, match.index)}</span>)
    }
    parts.push(<CodeBlock key={key++} code={match[2]} />)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push(<span key={key++} className="whitespace-pre-wrap">{content.slice(lastIndex)}</span>)
  }
  return <>{parts}</>
}

const AICopilot = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    const msg: Message = { id: crypto.randomUUID(), role, content, timestamp: Date.now() }
    setMessages(prev => [...prev.slice(-(MAX_MESSAGES - 1)), msg])
  }, [])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')
    addMessage('user', trimmed)
    setLoading(true)

    try {
      const res = await aiService.askQuestion(trimmed)
      addMessage('assistant', res.answer)
    } catch {
      addMessage('assistant', 'Sorry, something went wrong. Please check your API key in Settings and try again.')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [loading, addMessage])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const noApiKey = !GROQ_API_KEY

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700 bg-gray-800">
        <h1 className="text-xl font-bold text-white">🤖 AI Copilot</h1>
        <p className="text-gray-400 text-sm mt-0.5">Ask about devices, generate scripts, troubleshoot</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {noApiKey && (
          <div className="mx-auto max-w-md mt-8 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg text-center">
            <p className="text-yellow-300 font-medium">⚠️ API Key Not Configured</p>
            <p className="text-yellow-200/70 text-sm mt-1">Add VITE_GROQ_API_KEY to your .env file to enable AI features.</p>
          </div>
        )}

        {messages.length === 0 && !noApiKey && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-6">
              <div className="text-5xl">🤖</div>
              <h2 className="text-lg font-medium text-gray-300">How can I help?</h2>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {QUICK_ACTIONS.map(a => (
                  <button
                    key={a.label}
                    onClick={() => send(a.prompt)}
                    disabled={loading}
                    className="px-4 py-2 text-sm bg-gray-800 border border-gray-700 rounded-full hover:bg-gray-700 transition-colors text-gray-300 disabled:opacity-50"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-md'
                : 'bg-gray-800 text-gray-100 border border-gray-700 rounded-bl-md'
            }`}>
              {msg.role === 'assistant' ? renderContent(msg.content) : <span className="whitespace-pre-wrap">{msg.content}</span>}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions when chat is active */}
      {messages.length > 0 && !loading && (
        <div className="px-6 py-2 border-t border-gray-800 bg-gray-900">
          <div className="flex gap-2 overflow-x-auto">
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.label}
                onClick={() => send(a.prompt)}
                className="px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-full hover:bg-gray-700 transition-colors text-gray-400 whitespace-nowrap"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 bg-gray-800 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={noApiKey ? 'Configure API key first...' : 'Ask me anything...'}
            disabled={noApiKey || loading}
            className="flex-1 px-4 py-2.5 text-sm bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim() || noApiKey}
            className="px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}

export default AICopilot