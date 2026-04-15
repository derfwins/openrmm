import { useState, useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  agentId: string
  token: string
}

const Terminal = ({ agentId, token }: Props) => {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    setError(null)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/terminal/${agentId}/?token=${token}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setError(null)

      if (!xtermRef.current && termRef.current) {
        const xterm = new XTerm({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
          theme: {
            background: '#1a1b26',
            foreground: '#a9b1d6',
            cursor: '#c0caf5',
            selectionBackground: '#33467c',
          },
        })
        const fit = new FitAddon()
        xterm.loadAddon(fit)
        xterm.open(termRef.current)
        fit.fit()
        xtermRef.current = xterm
        fitRef.current = fit

        // Send terminal input
        xterm.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data }))
          }
        })

        // Send resize
        xterm.onResize(({ cols, rows }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols, rows }))
          }
        })

        // Send initial size
        ws.send(JSON.stringify({ type: 'resize', cols: xterm.cols, rows: xterm.rows }))

        // Handle window resize
        const onResize = () => fit.fit()
        window.addEventListener('resize', onResize)
      } else if (xtermRef.current) {
        xtermRef.current.clear()
        xtermRef.current.write('\x1b[32m--- Reconnected ---\x1b[0m\r\n')
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'output' && xtermRef.current) {
          xtermRef.current.write(msg.data)
        } else if (msg.type === 'exit') {
          if (xtermRef.current) {
            xtermRef.current.write(`\r\n\x1b[33m--- Session ended (exit code: ${msg.code ?? 'unknown'}) ---\x1b[0m\r\n`)
          }
          setConnected(false)
          ws.close()
        }
      } catch {
        // Raw text output
        if (xtermRef.current) {
          xtermRef.current.write(event.data)
        }
      }
    }

    ws.onclose = (event) => {
      setConnected(false)
      if (xtermRef.current && !event.wasClean) {
        xtermRef.current.write('\r\n\x1b[31m--- Disconnected ---\x1b[0m\r\n')
      }
      if (event.code === 4003) {
        setError('Agent is offline — cannot connect')
      } else if (event.code === 4004) {
        setError('Agent not found')
      } else if (event.code === 4001) {
        setError('Authentication failed')
      }
    }

    ws.onerror = () => {
      setError('Connection failed')
    }
  }

  const disconnect = () => {
    wsRef.current?.close()
    setConnected(false)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close()
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }
    }
  }, [])

  // Auto-connect when mounted
  useEffect(() => {
    if (agentId && token) {
      connect()
    }
  }, [agentId, token])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-500'}`} />
          <span className="text-sm text-gray-300">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex gap-2">
          {!connected ? (
            <button
              onClick={connect}
              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-red-900/50 border-b border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Terminal */}
      <div ref={termRef} className="flex-1 bg-[#1a1b26]" style={{ minHeight: '300px' }} />
    </div>
  )
}

export default Terminal