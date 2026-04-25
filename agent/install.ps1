# OpenRMM Agent Installer for Windows
# Run as Administrator in PowerShell
param(
    [string]$Server = "",
    [int]$ClientId = 0,
    [int]$SiteId = 0,
    [string]$AgentType = "server"
)

$ErrorActionPreference = "Stop"

if (-not $Server -or $ClientId -eq 0 -or $SiteId -eq 0) {
    Write-Host "Usage: .\install.ps1 -Server https://openrmm.derfwins.com -ClientId 1 -SiteId 1" -ForegroundColor Yellow
    Write-Host "Get these values from the Install Agent page in OpenRMM" -ForegroundColor Yellow
    exit 1
}

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Run PowerShell as Administrator!" -ForegroundColor Red
    exit 1
}

$InstallDir = "C:\Program Files\OpenRMM"
$AgentScript = "openrmm-agent.py"

Write-Host "=== OpenRMM Agent Installer ===" -ForegroundColor Cyan
Write-Host "Server: $Server"
Write-Host "Client: $ClientId | Site: $SiteId | Type: $AgentType"
Write-Host ""

# Check Python 3
Write-Host "Checking Python 3..." -ForegroundColor Cyan
$pythonExe = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3\.") {
            $pythonExe = $cmd
            Write-Host "Found: $ver" -ForegroundColor Green
            break
        }
    } catch {}
}

if (-not $pythonExe) {
    Write-Host "Python 3 not found. Installing via winget..." -ForegroundColor Yellow
    winget install Python.Python.3 --accept-package-agreements --accept-source-agreements
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $pythonExe = "python"
}

# Install psutil
Write-Host "Installing psutil..." -ForegroundColor Cyan
& $pythonExe -m pip install psutil --quiet

# Create install directory
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

# Copy agent script
Copy-Item $AgentScript -Destination "$InstallDir\$AgentScript" -Force
Copy-Item requirements.txt -Destination "$InstallDir\requirements.txt" -Force

# Install service deps
& $pythonExe -m pip install -r "$InstallDir\requirements.txt" --quiet

# Create launcher batch file
$LaunchScript = "@echo off`n$pythonExe `"$InstallDir\$AgentScript`" --server $Server --client-id $ClientId --site-id $SiteId --agent-type $AgentType"
Set-Content -Path "$InstallDir\launch.bat" -Value $LaunchScript

# Register as scheduled task (runs on startup, restarts on failure)
$TaskName = "OpenRMM-Agent"
Unregister-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction -Execute "$InstallDir\launch.bat"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "OpenRMM Monitoring Agent" | Out-Null

# Start now
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "=== Agent Installed Successfully! ===" -ForegroundColor Green
Write-Host "Install dir: $InstallDir"
Write-Host "Service: Scheduled Task '$TaskName' (runs as SYSTEM on startup)"
Write-Host "Log: $InstallDir\agent.log"
Write-Host ""
Write-Host "The agent will automatically download and install the MeshCentral"
Write-Host "remote access agent on first startup. No manual steps required."
Write-Host ""
Write-Host "To uninstall: Unregister-ScheduledTask -TaskName OpenRMM-Agent; Remove-Item '$InstallDir' -Recurse"