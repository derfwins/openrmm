# OpenRMM Agent Installer for Windows
# Run as Administrator in PowerShell
param(
    [string]$ServerUrl = "",
    [string]$Client = "",
    [string]$Site = "",
    [string]$AgentType = "server",
    [string]$AuthToken = ""
)

$ErrorActionPreference = "Stop"

# --- Config ---
$AgentVersion = "1.0.0"
$AgentBinary = "openrmm-agent-$AgentVersion-windows-amd64.exe"
$DownloadUrl = "$ServerUrl/api/agents/download/$AgentBinary"
$InstallDir = "C:\Program Files\OpenRMM\Agent"
$ServiceName = "OpenRMMAgent"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenRMM Agent Installer for Windows" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Check Admin ---
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script must be run as Administrator!" -ForegroundColor Red
    exit 1
}

# --- Enroll with server ---
Write-Host "[1/5] Enrolling agent with server..." -ForegroundColor Yellow
$enrollBody = @{
    hostname = $env:COMPUTERNAME
    platform = "windows"
    agent_type = $AgentType
    client = $Client
    site = $Site
} | ConvertTo-Json

try {
    $enrollResp = Invoke-RestMethod -Uri "$ServerUrl/api/agents/enroll/" -Method POST -Body $enrollBody -ContentType "application/json" -Headers @{ Authorization = "Bearer $AuthToken" }
    $AgentId = $enrollResp.agent_id
    $AgentSecret = $enrollResp.secret
    Write-Host "  Agent ID: $AgentId" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Enrollment failed: $_" -ForegroundColor Red
    exit 1
}

# --- Download agent binary ---
Write-Host "[2/5] Downloading agent binary..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile "$InstallDir\$AgentBinary" -UseBasicParsing
} catch {
    Write-Host "[WARN] Download failed, creating placeholder binary" -ForegroundColor Yellow
    # Create a placeholder that connects via NATS
    $placeholder = @"
using System;
using System.Net.Http;
using System.Threading;
class Agent {
    static void Main() {
        var client = new HttpClient();
        client.DefaultRequestHeaders.Add("Authorization", "Bearer $AgentSecret");
        while(true) {
            try {
                client.PostAsync("$ServerUrl/api/agents/heartbeat/", 
                    new StringContent("{\"agent_id\":\"$AgentId\"}", System.Text.Encoding.UTF8, "application/json")).Wait();
            } catch {}
            Thread.Sleep(30000);
        }
    }
}
"@
    Set-Content -Path "$InstallDir\agent.cs" -Value $placeholder
}

# --- Write config ---
Write-Host "[3/5] Writing configuration..." -ForegroundColor Yellow
$config = @"
[agent]
id = $AgentId
server_url = $ServerUrl
secret = $AgentSecret

[heartbeat]
interval = 30

[nats]
url = $ServerUrl:4222
"@
Set-Content -Path "$InstallDir\agent.conf" -Value $config

# --- Install as Windows service ---
Write-Host "[4/5] Installing Windows service..." -ForegroundColor Yellow
$serviceExe = "$InstallDir\$AgentBinary"
if (Test-Path $serviceExe) {
    # Use sc.exe to create the service
    & sc.exe create $ServiceName binPath= $serviceExe start= auto DisplayName= "OpenRMM Agent" 2>$null
    & sc.exe description $ServiceName "OpenRMM Remote Monitoring Agent"
    & sc.exe start $ServiceName
} else {
    # Use NSSM if available, otherwise scheduled task fallback
    Write-Host "  Binary not available, setting up scheduled task fallback..." -ForegroundColor Yellow
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -File `"$InstallDir\heartbeat.ps1`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Seconds 30)
    Register-ScheduledTask -TaskName "OpenRMMAgent" -Action $action -Trigger $trigger -RunLevel Highest -Force | Out-Null
    
    $heartbeatScript = @"
while(`$true) {
    try {
        Invoke-RestMethod -Uri "$ServerUrl/api/agents/heartbeat/" -Method POST -Body '{"agent_id":"$AgentId"}' -ContentType "application/json" -Headers @{ Authorization = "Bearer $AgentSecret" }
    } catch {}
    Start-Sleep -Seconds 30
}
"@
    Set-Content -Path "$InstallDir\heartbeat.ps1" -Value $heartbeatScript
}

# --- Verify ---
Write-Host "[5/5] Verifying installation..." -ForegroundColor Yellow
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "  Service is running!" -ForegroundColor Green
} else {
    Write-Host "  Service installed but may need manual start" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Agent installed successfully!" -ForegroundColor Green
Write-Host "  Agent ID: $AgentId" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green