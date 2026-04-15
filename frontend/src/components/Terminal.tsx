import { useState } from 'react'

interface CommandOutput {
  id: string
  agentName: string
  command: string
  output: string
  exitCode: number
  runtime: number
  timestamp: string
}

const Terminal = () => {
  const [activeTab, setActiveTab] = useState<'interactive' | 'history'>('interactive')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [shell, setShell] = useState<'powershell' | 'cmd' | 'bash'>('powershell')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState<Array<{ text: string; type: 'input' | 'output' | 'error' }>>([])
  const [history, setHistory] = useState<CommandOutput[]>([
    { id: '1', agentName: 'DESKTOP-460RMO6', command: 'Get-Service | Where-Object {$_.Status -eq "Running"}', output: 'Running  AudioServ...\nRunning  BFE...\nRunning  BITS...', exitCode: 0, runtime: 2.3, timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: '2', agentName: 'fhowland-plex', command: 'df -h', output: 'Filesystem      Size  Used Avail Use%\n/dev/sda1       500G  310G  190G  63%', exitCode: 0, runtime: 0.8, timestamp: new Date(Date.now() - 7200000).toISOString() },
    { id: '3', agentName: 'DESKTOP-460RMO6', command: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 5', output: 'Handles  NPM(K)    PM(K)      WS(K)   CPU(s)     Id  SI ProcessName\n    894      42    34520      42160    142.31   4232   1 chrome', exitCode: 0, runtime: 1.1, timestamp: new Date(Date.now() - 10800000).toISOString() },
  ])
  const [isRunning, setIsRunning] = useState(false)

  const agents = [
    { id: '1', name: 'DESKTOP-460RMO6', platform: 'windows' },
    { id: '2', name: 'fhowland-plex', platform: 'linux' },
    { id: '3', name: 'Ayla PC', platform: 'windows' },
  ]

  const executeCommand = () => {
    if (!input.trim() || !selectedAgent) return

    const cmd = input.trim()
    setInput('')
    setOutput(prev => [...prev, { text: `${shell === 'powershell' ? 'PS' : shell === 'cmd' ? 'C:>' : '$'} ${cmd}`, type: 'input' }])
    setIsRunning(true)

    // Simulate command execution
    setTimeout(() => {
      const agentName = agents.find(a => a.id === selectedAgent)?.name || 'unknown'
      const mockOutputs: Record<string, string> = {
        'whoami': agentName === 'fhowland-plex' ? 'root' : 'NT AUTHORITY\\SYSTEM',
        'hostname': agentName,
        'ipconfig': 'IPv4 Address: 192.168.1.100\nSubnet Mask: 255.255.255.0',
        'ifconfig': 'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  inet 192.168.1.101',
        'uptime': shell === 'bash' ? 'up 42 days, 3:17' : 'System Boot Time: 3/1/2026, 8:00:00 AM',
        'systeminfo': shell === 'powershell' ? 'Host Name: DESKTOP-460RMO6\nOS Name: Microsoft Windows 11 Pro\nOS Version: 10.0.22631' : 'Linux fhowland-plex 6.8.0-generic',
        'help': 'Available commands: whoami, hostname, ipconfig/ifconfig, uptime, systeminfo, ps, df, netstat, ping',
        'ps': shell === 'bash' ? '  PID TTY          TIME CMD\n    1 ?        00:00:03 systemd\n  423 ?        00:12:45 plexmediaserver' : 'Handles  NPM(K)    PM(K)      WS(K)     Id  ProcessName\n   894     42    34520      42160   4232  chrome',
        'df': 'Filesystem      Size  Used Avail Use%\n/dev/sda1       500G  310G  190G  63%',
        'netstat': 'Proto  Local Address          Foreign Address        State\nTCP    0.0.0.0:3389         0.0.0.0:*              LISTENING\nTCP    0.0.0.0:8080         0.0.0.0:*              LISTENING',
        'ping google.com': 'Pinging google.com [142.250.80.46] with 32 bytes of data:\nReply from 142.250.80.46: bytes=32 time=14ms TTL=118',
      }

      const result = mockOutputs[cmd] || `Command '${cmd}' executed on ${agentName}\nExit code: 0`
      setOutput(prev => [...prev, { text: result, type: 'output' }])
      setIsRunning(false)

      setHistory(prev => [{
        id: Date.now().toString(),
        agentName,
        command: cmd,
        output: result,
        exitCode: 0,
        runtime: Math.random() * 3 + 0.5,
        timestamp: new Date().toISOString(),
      }, ...prev])
    }, 800 + Math.random() * 1200)
  }

  const clearOutput = () => setOutput([])

  const selectedPlatform = agents.find(a => a.id === selectedAgent)?.platform || 'windows'

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold text-sm">💻 Terminal</h2>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
          >
            <option value="">Select Agent</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.platform})</option>
            ))}
          </select>
          {selectedAgent && (
            <select
              value={shell}
              onChange={(e) => setShell(e.target.value as typeof shell)}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
            >
              {selectedPlatform === 'windows' ? (
                <>
                  <option value="powershell">PowerShell</option>
                  <option value="cmd">CMD</option>
                </>
              ) : (
                <option value="bash">Bash</option>
              )}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-700 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('interactive')}
              className={`px-3 py-1 text-xs rounded ${activeTab === 'interactive' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Interactive
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 text-xs rounded ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              History ({history.length})
            </button>
          </div>
          {activeTab === 'interactive' && (
            <button onClick={clearOutput} className="px-2 py-1 bg-gray-700 text-xs rounded hover:bg-gray-600 border border-gray-600">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      {activeTab === 'interactive' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Output Area */}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-gray-950">
            {!selectedAgent && (
              <div className="text-gray-500 text-center mt-8">
                <div className="text-4xl mb-3">💻</div>
                <p>Select an agent to start a terminal session</p>
              </div>
            )}
            {selectedAgent && output.length === 0 && (
              <div className="text-gray-500">
                <p>Connected to {agents.find(a => a.id === selectedAgent)?.name}</p>
                <p className="mt-1">Shell: {shell}</p>
                <p className="mt-2 text-xs">Type 'help' for available demo commands</p>
              </div>
            )}
            {output.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap ${line.type === 'input' ? 'text-green-400' : line.type === 'error' ? 'text-red-400' : 'text-gray-300'}`}>
                {line.text}
              </div>
            ))}
            {isRunning && (
              <div className="text-yellow-400 animate-pulse">▌</div>
            )}
          </div>

          {/* Input Area */}
          <div className="bg-gray-800 border-t border-gray-700 px-4 py-3 flex items-center gap-2">
            <span className="text-green-400 text-sm font-mono">
              {shell === 'powershell' ? 'PS' : shell === 'cmd' ? 'C:>' : '$'}
            </span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeCommand()}
              placeholder={selectedAgent ? 'Enter command...' : 'Select an agent first'}
              disabled={!selectedAgent || isRunning}
              className="flex-1 bg-transparent text-white font-mono text-sm outline-none disabled:opacity-50"
            />
            <button
              onClick={executeCommand}
              disabled={!selectedAgent || !input.trim() || isRunning}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Run
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-gray-950">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 text-xs text-gray-400">
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">Agent</th>
                <th className="text-left px-4 py-2 font-medium">Command</th>
                <th className="text-left px-4 py-2 font-medium">Exit</th>
                <th className="text-left px-4 py-2 font-medium">Runtime</th>
                <th className="text-left px-4 py-2 font-medium">Output</th>
              </tr>
            </thead>
            <tbody>
              {history.map(entry => (
                <tr key={entry.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2 text-white text-xs font-medium">
                    {entry.agentName}
                  </td>
                  <td className="px-4 py-2 text-green-400 text-xs font-mono max-w-[200px] truncate">
                    {entry.command}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs ${entry.exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {entry.exitCode}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {entry.runtime.toFixed(1)}s
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs font-mono max-w-[300px] truncate">
                    {entry.output.split('\n')[0]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Terminal