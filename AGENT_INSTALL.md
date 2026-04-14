# OpenRMM Agent Installation

## Quick Install - Windows (PowerShell)

Run this in an elevated PowerShell prompt on the target machine:

```powershell
# OpenRMM Agent Installer
# Run as Administrator

$rmmServer = "http://10.10.0.122:8000"
$client = "1"
$site = "1"

# Get install script from server
$loginBody = @{username="admin"; password="admin"; twofactor="sekret"} | ConvertTo-Json
$token = (Invoke-RestMethod -Uri "$rmmServer/v2/login/" -Method POST -Body $loginBody -ContentType "application/json").token

$installBody = @{
    plat = "windows"
    goarch = "amd64"
    client = [int]$client
    site = [int]$site
    expires = 24
    installMethod = "powershell"
    api = $rmmServer
    agenttype = "server"
    power = 1
    rdp = 1
    ping = 1
    fileName = "tacticalagent-v2.10.0-windows-amd64.exe"
} | ConvertTo-Json

$script = Invoke-RestMethod -Uri "$rmmServer/agents/installer/" -Method POST -Body $installBody -ContentType "application/json" -Headers @{Authorization = "Token $token"}

# Execute the install script
Invoke-Expression $script.cmd
```

## Quick Install - Linux (Bash)

```bash
# OpenRMM Agent Installer
# Run as root

RMM_SERVER="http://10.10.0.122:8000"
CLIENT=1
SITE=1

# Get auth token
TOKEN=$(curl -s $RMM_SERVER/v2/login/ \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin","twofactor":"sekret"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# Get install script
INSTALL_CMD=$(curl -s $RMM_SERVER/agents/installer/ \
  -X POST \
  -H "Authorization: Token $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"plat\":\"linux\",\"goarch\":\"amd64\",\"client\":$CLIENT,\"site\":$SITE,\"expires\":24,\"installMethod\":\"bash\",\"api\":\"$RMM_SERVER\",\"agenttype\":\"server\",\"power\":1,\"rdp\":1,\"ping\":1,\"fileName\":\"tacticalagent-v2.10.0-linux-amd64\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('cmd','ERROR'))")

echo "$INSTALL_CMD"
# To execute: eval "$INSTALL_CMD"
```

## Agent Versions

| Platform | Architecture | Version | Download |
|----------|-------------|---------|----------|
| Windows | amd64 | 2.10.0 | [Download](https://github.com/amidaware/rmmagent/releases/download/v2.10.0/tacticalagent-v2.10.0-windows-amd64.exe) |
| Windows | arm64 | 2.10.0 | [Download](https://github.com/amidaware/rmmagent/releases/download/v2.10.0/tacticalagent-v2.10.0-windows-arm64.exe) |
| Linux | amd64 | 2.10.0 | [Download](https://github.com/amidaware/rmmagent/releases/download/v2.10.0/tacticalagent-v2.10.0-linux-amd64) |
| Linux | arm64 | 2.10.0 | [Download](https://github.com/amidaware/rmmagent/releases/download/v2.10.0/tacticalagent-v2.10.0-linux-arm64) |

## Notes

- The server must be reachable from the agent machine (port 8000)
- For production, use HTTPS and update `api` URL accordingly
- Agent type `server` enables all monitoring features
- Set `power=1` for power management, `rdp=1` for RDP access, `ping=1` for ping checks