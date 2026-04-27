"""Seed built-in troubleshooting scripts into the database on startup."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from v2.models.script import Script


BUILTIN_SCRIPTS = [
    # --- Diagnostics ---
    {
        "name": "System Information Report",
        "description": "Collect comprehensive system info: OS, hardware, disks, network, running processes, services, and event log errors.",
        "category": "Diagnostics",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# System Information Report
Write-Host "=== SYSTEM INFORMATION REPORT ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "--- Operating System ---" -ForegroundColor Yellow
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture, @{N='InstallDate';E={$_.InstallDate.ToString('yyyy-MM-dd')}}, @{N='Uptime';E={(Get-Date) - $_.LastBootUpTime}} | Format-List

Write-Host "--- Computer System ---" -ForegroundColor Yellow
Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, @{N='RAM_GB';E={[math]::Round($_.TotalPhysicalMemory/1GB,2)}}, NumberOfProcessors, NumberOfLogicalProcessors, Domain, PartOfDomain | Format-List

Write-Host "--- CPU Info ---" -ForegroundColor Yellow
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, CurrentClockSpeed | Format-Table -AutoSize

Write-Host "--- Disk Info ---" -ForegroundColor Yellow
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{N='Size_GB';E={[math]::Round($_.Size/1GB,2)}}, @{N='Free_GB';E={[math]::Round($_.FreeSpace/1GB,2)}}, @{N='Used_Pct';E={[math]::Round(($_.Size-$_.FreeSpace)/$_.Size*100,1)}} | Format-Table -AutoSize

Write-Host "--- Network Adapters ---" -ForegroundColor Yellow
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*'} | Select-Object InterfaceAlias, IPAddress, PrefixLength | Format-Table -AutoSize

Write-Host "--- Top 10 Processes by Memory ---" -ForegroundColor Yellow
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 Name, @{N='Mem_MB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, CPU, Id | Format-Table -AutoSize

Write-Host "--- Failed Services ---" -ForegroundColor Yellow
Get-Service | Where-Object {$_.Status -eq 'Stopped' -and $_.StartType -eq 'Automatic'} | Select-Object Name, DisplayName, Status | Format-Table -AutoSize

Write-Host "--- Recent System Errors (last 24h) ---" -ForegroundColor Yellow
Get-WinEvent -LogName System -MaxEvents 50 | Where-Object {$_.Level -le 3 -and $_.TimeCreated -gt (Get-Date).AddHours(-24)} | Select-Object TimeCreated, Id, LevelDisplayName, Message | Format-Table -Wrap

Write-Host "=== END REPORT ===" -ForegroundColor Cyan
""",
        "timeout": 120,
    },
    {
        "name": "Network Diagnostics",
        "description": "IP config, DNS resolution test, ping test, adapter info, routing table, and active connections.",
        "category": "Network",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Network Diagnostics
Write-Host "=== NETWORK DIAGNOSTICS ===" -ForegroundColor Cyan

Write-Host "--- IP Configuration ---" -ForegroundColor Yellow
ipconfig /all

Write-Host "`n--- DNS Resolution Test ---" -ForegroundColor Yellow
Resolve-DnsName google.com -ErrorAction SilentlyContinue | Format-Table -AutoSize
Resolve-DnsName internal.local -ErrorAction SilentlyContinue | Format-Table -AutoSize

Write-Host "`n--- Ping Tests ---" -ForegroundColor Yellow
@( '8.8.8.8', '1.1.1.1', $env:LOGONSERVER.Trim('\\') ) | ForEach-Object {
    $target = $_
    $result = Test-Connection -ComputerName $target -Count 4 -ErrorAction SilentlyContinue
    if ($result) { Write-Host "$target : $($result[-1].ResponseTime)ms avg" }
    else { Write-Host "$target : UNREACHABLE" -ForegroundColor Red }
}

Write-Host "`n--- Active TCP Connections (top 20) ---" -ForegroundColor Yellow
Get-NetTCPConnection -State Established | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, OwningProcess, @{N='Process';E={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} | Select-Object -First 20 | Format-Table -AutoSize

Write-Host "`n=== END DIAGNOSTICS ===" -ForegroundColor Cyan
""",
        "timeout": 120,
    },
    {
        "name": "Disk Health Check",
        "description": "Disk space, volume info, chkdsk status, and SMART health via WMI.",
        "category": "Diagnostics",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Disk Health Check
Write-Host "=== DISK HEALTH CHECK ===" -ForegroundColor Cyan

Write-Host "--- Volume Information ---" -ForegroundColor Yellow
Get-Volume | Where-Object {$_.DriveLetter} | Select-Object DriveLetter, FileSystemLabel, FileSystem, @{N='Size_GB';E={[math]::Round($_.Size/1GB,2)}}, @{N='Free_GB';E={[math]::Round($_.SizeRemaining/1GB,2)}}, HealthRemaining | Format-Table -AutoSize

Write-Host "--- Disk Partition Info ---" -ForegroundColor Yellow
Get-Disk | Select-Object Number, FriendlyName, @{N='Size_GB';E={[math]::Round($_.Size/1GB,2)}}, PartitionStyle, OperationalStatus, HealthStatus | Format-Table -AutoSize

Write-Host "--- ChkDsk Status ---" -ForegroundColor Yellow
fsutil dirty query C: 2>&1
fsutil dirty query D: 2>&1

Write-Host "`n=== END CHECK ===" -ForegroundColor Cyan
""",
        "timeout": 120,
    },

    # --- Network Repair ---
    {
        "name": "Flush DNS & Reset Network",
        "description": "Flush DNS cache, reset Winsock, reset TCP/IP stack, release and renew IP.",
        "category": "Network",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Flush DNS & Reset Network Stack
Write-Host "=== NETWORK RESET ===" -ForegroundColor Cyan

Write-Host "Flushing DNS cache..." -ForegroundColor Yellow
ipconfig /flushdns

Write-Host "Resetting Winsock..." -ForegroundColor Yellow
netsh winsock reset

Write-Host "Resetting IP stack..." -ForegroundColor Yellow
netsh int ip reset

Write-Host "Resetting IPv6 stack..." -ForegroundColor Yellow
netsh int ipv6 reset

Write-Host "Clearing ARP cache..." -ForegroundColor Yellow
netsh interface ip delete arpcache

Write-Host "Releasing IP..." -ForegroundColor Yellow
ipconfig /release

Write-Host "Renewing IP..." -ForegroundColor Yellow
ipconfig /renew

Write-Host "Re-registering DNS..." -ForegroundColor Yellow
ipconfig /registerdns

Write-Host "`nNetwork reset complete. A reboot may be required." -ForegroundColor Green
""",
        "timeout": 120,
    },

    # --- Cleanup ---
    {
        "name": "Clear Temp Files & Caches",
        "description": "Clear Windows Temp, user temp, browser caches, thumbnail cache, and recycle bin.",
        "category": "Cleanup",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Clear Temp Files & Caches
Write-Host "=== CLEANUP TEMP FILES ===" -ForegroundColor Cyan

$before = (Get-ChildItem -Path "$env:TEMP" -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum

# Windows Temp
Write-Host "Clearing Windows Temp..." -ForegroundColor Yellow
Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "C:\Windows\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue

# Browser caches
Write-Host "Clearing Chrome cache..." -ForegroundColor Yellow
$chromeCache = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"
if (Test-Path $chromeCache) { Remove-Item "$chromeCache\*" -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "Clearing Edge cache..." -ForegroundColor Yellow
$edgeCache = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"
if (Test-Path $edgeCache) { Remove-Item "$edgeCache\*" -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "Clearing Firefox cache..." -ForegroundColor Yellow
$ffCache = "$env:LOCALAPPDATA\Mozilla\Firefox\Profiles\*\cache2"
Get-Item $ffCache -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item "$($_.FullName)\*" -Recurse -Force -ErrorAction SilentlyContinue }

# Thumbnail cache
Write-Host "Clearing thumbnail cache..." -ForegroundColor Yellow
Remove-Item "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db" -Force -ErrorAction SilentlyContinue

# Recycle Bin
Write-Host "Emptying Recycle Bin..." -ForegroundColor Yellow
Clear-RecycleBin -Force -ErrorAction SilentlyContinue

$after = (Get-ChildItem -Path "$env:TEMP" -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$freed = [math]::Round(($before - $after) / 1MB, 2)

Write-Host "`nCleanup complete! Approx ${freed} MB freed." -ForegroundColor Green
""",
        "timeout": 300,
    },
    {
        "name": "Clear Windows Update Cache",
        "description": "Stop WU services, clear SoftwareDistribution, restart services.",
        "category": "Cleanup",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Clear Windows Update Cache
Write-Host "=== CLEARING WINDOWS UPDATE CACHE ===" -ForegroundColor Cyan

Write-Host "Stopping Windows Update services..." -ForegroundColor Yellow
Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue
Stop-Service -Name bits -Force -ErrorAction SilentlyContinue

Write-Host "Clearing SoftwareDistribution..." -ForegroundColor Yellow
Remove-Item -Path "C:\Windows\SoftwareDistribution\Download\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "C:\Windows\SoftwareDistribution\DataStore\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Starting Windows Update services..." -ForegroundColor Yellow
Start-Service -Name wuauserv -ErrorAction SilentlyContinue
Start-Service -Name bits -ErrorAction SilentlyContinue

Write-Host "`nWindows Update cache cleared. Run 'winget upgrade' to check for updates." -ForegroundColor Green
""",
        "timeout": 120,
    },

    # --- Repair ---
    {
        "name": "SFC & DISM System Repair",
        "description": "Run System File Checker and DISM restore health scan to repair corrupted system files.",
        "category": "Repair",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# SFC & DISM System Repair
Write-Host "=== SYSTEM FILE REPAIR ===" -ForegroundColor Cyan

Write-Host "Running System File Checker..." -ForegroundColor Yellow
sfc /scannow

Write-Host "`nRunning DISM Restore Health..." -ForegroundColor Yellow
DISM /Online /Cleanup-Image /RestoreHealth

Write-Host "`n=== SYSTEM REPAIR COMPLETE ===" -ForegroundColor Green
Write-Host "Reboot may be required if issues were found." -ForegroundColor Yellow
""",
        "timeout": 600,
    },
    {
        "name": "Reset Windows Update",
        "description": "Restart WU services, delete SoftwareDistribution, re-register WU DLLs, and reset the catalog.",
        "category": "Repair",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Reset Windows Update
Write-Host "=== RESETTING WINDOWS UPDATE ===" -ForegroundColor Cyan

# Stop services
Write-Host "Stopping services..." -ForegroundColor Yellow
@('wuauserv','bits','cryptsvc','msiserver') | ForEach-Object { Stop-Service -Name $_ -Force -ErrorAction SilentlyContinue }

# Delete cache
Write-Host "Clearing update cache..." -ForegroundColor Yellow
Remove-Item -Path "C:\Windows\SoftwareDistribution\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "C:\Windows\System32\catroot2\*" -Recurse -Force -ErrorAction SilentlyContinue

# Re-register DLLs
Write-Host "Re-registering WU DLLs..." -ForegroundColor Yellow
$dlls = @('wups2.dll','wups.dll','wuaueng.dll','wucltux.dll','wudriver.dll','wuapi.dll','wuanclcx.dll')
foreach ($dll in $dlls) {
    regsvr32 /s "C:\Windows\System32\$dll" 2>$null
}

# Reset catalog
Write-Host "Resetting WU catalog..." -ForegroundColor Yellow
netsh winsock reset
netsh int ip reset
ipconfig /flushdns

# Start services
Write-Host "Starting services..." -ForegroundColor Yellow
@('cryptsvc','bits','wuauserv','msiserver') | ForEach-Object { Start-Service -Name $_ -ErrorAction SilentlyContinue }

Write-Host "`nWindows Update has been reset. Check for updates now." -ForegroundColor Green
""",
        "timeout": 300,
    },
    {
        "name": "Repair WMI Repository",
        "description": "Verify and rebuild the WMI repository if corrupted. Essential for monitoring agents.",
        "category": "Repair",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Repair WMI Repository
Write-Host "=== WMI REPOSITORY REPAIR ===" -ForegroundColor Cyan

Write-Host "Testing WMI..." -ForegroundColor Yellow
$test = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
if ($test) {
    Write-Host "WMI appears functional: $($test.Caption)" -ForegroundColor Green
    Write-Host "Running WMI verification..." -ForegroundColor Yellow
} else {
    Write-Host "WMI appears BROKEN - attempting repair..." -ForegroundColor Red
}

Write-Host "Salvaging WMI repository..." -ForegroundColor Yellow
winmgmt /salvagerepository 2>&1

Write-Host "Verifying WMI after salvage..." -ForegroundColor Yellow
$test2 = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
if ($test2) {
    Write-Host "WMI repaired successfully!" -ForegroundColor Green
} else {
    Write-Host "Salvage failed, attempting full reset..." -ForegroundColor Red
    winmgmt /resetrepository 2>&1
    winmgmt /resynchperf 2>&1
    $test3 = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    if ($test3) { Write-Host "WMI repaired after reset!" -ForegroundColor Green }
    else { Write-Host "WMI repair FAILED. Manual intervention may be required." -ForegroundColor Red }
}

Write-Host "`n=== WMI REPAIR COMPLETE ===" -ForegroundColor Cyan
""",
        "timeout": 300,
    },

    # --- Security ---
    {
        "name": "Security Audit Quick Scan",
        "description": "Firewall status, Windows Defender status, local admins, open ports, scheduled tasks, startup items.",
        "category": "Security",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Security Audit Quick Scan
Write-Host "=== SECURITY AUDIT ===" -ForegroundColor Cyan

Write-Host "--- Firewall Status ---" -ForegroundColor Yellow
Get-NetFirewallProfile | Select-Object Name, Enabled | Format-Table -AutoSize

Write-Host "--- Windows Defender Status ---" -ForegroundColor Yellow
Get-MpComputerStatus | Select-Object AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated, QuickScanAge | Format-List

Write-Host "--- Local Administrators ---" -ForegroundColor Yellow
Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction SilentlyContinue | Select-Object Name, ObjectClass, PrincipalSource | Format-Table -AutoSize

Write-Host "--- Listening Ports ---" -ForegroundColor Yellow
Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess, @{N='Process';E={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} | Sort-Object LocalPort | Format-Table -AutoSize

Write-Host "--- Scheduled Tasks (non-Microsoft, enabled) ---" -ForegroundColor Yellow
Get-ScheduledTask | Where-Object {$_.Author -notlike 'Microsoft*' -and $_.Author -notlike 'NT *' -and $_.State -ne 'Disabled'} | Select-Object TaskName, Author, State | Select-Object -First 20 | Format-Table -AutoSize

Write-Host "--- Startup Items ---" -ForegroundColor Yellow
Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location | Format-Table -AutoSize

Write-Host "=== END AUDIT ===" -ForegroundColor Cyan
""",
        "timeout": 120,
    },
    {
        "name": "Check Windows Defender Status",
        "description": "Defender signature age, real-time protection, exclusions, last scan time, and threat history.",
        "category": "Security",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Check Windows Defender Status
Write-Host "=== WINDOWS DEFENDER STATUS ===" -ForegroundColor Cyan

Write-Host "--- Defender Overview ---" -ForegroundColor Yellow
$status = Get-MpComputerStatus
$status | Select-Object AntivirusEnabled, AMServiceEnabled, AntispywareEnabled, RealTimeProtectionEnabled, IoavProtectionEnabled, BehaviorMonitorEnabled | Format-List

Write-Host "--- Signature Info ---" -ForegroundColor Yellow
$status | Select-Object AntivirusSignatureLastUpdated, AntivirusSignatureVersion, AntispywareSignatureLastUpdated, AntispywareSignatureVersion | Format-List

Write-Host "--- Recent Threats ---" -ForegroundColor Yellow
Get-MpThreatDetection | Select-Object -First 10 @{N='Time';E={$_.InitialDetectionTime}}, @{N='Threat';E={$_.ThreatName}}, @{N='Action';E={$_.ActionSuccess}}, @{N='Resource';E={$_.Resources -join ', '}} | Format-Table -AutoSize

Write-Host "--- Exclusions ---" -ForegroundColor Yellow
Get-MpPreference | Select-Object ExclusionPath, ExclusionExtension, ExclusionProcess | Format-List

Write-Host "=== END CHECK ===" -ForegroundColor Cyan
""",
        "timeout": 60,
    },

    # --- Power Management ---
    {
        "name": "Power Configuration Report",
        "description": "Current power plan, sleep/hibernate settings, Wake-on-LAN capability, and battery health.",
        "category": "Power Management",
        "shell": "powershell",
        "script_type": "powershell",
        "script_body": r"""# Power Configuration Report
Write-Host "=== POWER CONFIGURATION ===" -ForegroundColor Cyan

Write-Host "--- Active Power Plan ---" -ForegroundColor Yellow
powercfg /getactivescheme

Write-Host "`n--- All Power Plans ---" -ForegroundColor Yellow
Get-CimInstance Win32_PowerPlan -Namespace root\cimv2\power | Where-Object {$_.IsActive} | Select-Object ElementName | Format-List

Write-Host "--- Sleep & Hibernate Settings ---" -ForegroundColor Yellow
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE
powercfg /query SCHEME_CURRENT SUB_SLEEP HYBRIDSLEEP
powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE

Write-Host "--- Wake-on-LAN ---" -ForegroundColor Yellow
Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | ForEach-Object {
    $adapter = $_
    $wol = Get-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword 'EnableWakeOnLan' -ErrorAction SilentlyContinue
    [PSCustomObject]@{
        Adapter = $adapter.Name
        WoL_Enabled = if ($wol) { $wol.DisplayValue } else { 'Unknown' }
    }
} | Format-Table -AutoSize

Write-Host "--- Battery ---" -ForegroundColor Yellow
$bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
if ($bat) {
    $bat | Select-Object Name, EstimatedChargeRemaining, BatteryStatus, @{N='DesignVoltage';E={$_.DesignVoltage}}, @{N='FullChargeCapacity';E={$_.FullChargeCapacity}} | Format-List
    Write-Host "Generating battery report..." -ForegroundColor Yellow
    powercfg /batteryreport /output "$env:TEMP\battery-report.html" 2>$null
    Write-Host "Battery report saved to: $env:TEMP\battery-report.html" -ForegroundColor Green
} else {
    Write-Host "No battery detected (desktop/VM)" -ForegroundColor Gray
}

Write-Host "`n=== END REPORT ===" -ForegroundColor Cyan
""",
        "timeout": 120,
    },
]


async def seed_builtin_scripts(db: AsyncSession):
    """Insert built-in troubleshooting scripts if they don't already exist."""
    for builtin in BUILTIN_SCRIPTS:
        result = await db.execute(
            select(Script).where(Script.name == builtin["name"])
        )
        existing = result.scalar_one_or_none()
        if not existing:
            script = Script(
                name=builtin["name"],
                description=builtin["description"],
                category=builtin["category"],
                shell=builtin["shell"],
                script_type=builtin.get("script_type", builtin["shell"]),
                script_body=builtin["script_body"],
                timeout=builtin.get("timeout", 300),
                created_by="system",
                is_active=True,
            )
            db.add(script)
    await db.commit()