# OpenRMM Monitoring System Design

## Overview
PRTG-style monitoring with distributed probes, SNMP, and network device backup.

## Architecture

### Core Concepts
1. **Probes** - Lightweight agents deployed on-premise that perform checks
2. **Sensors** - Individual monitoring checks (ping, SNMP, HTTP, port, etc.)
3. **Sensor Types** - Templates defining what and how to monitor
4. **Auto-Discovery** - Scan networks for devices and suggest sensors
5. **Network Backups** - Scheduled config pulls via SSH/Telnet/SNMP

### Probe Architecture
- **Server Probe** - Runs on the OpenRMM server itself (monitors public IPs, cloud services)
- **Client Probe** - Deployed on a device at the client site (monitors local LAN devices)
- Probes are lightweight Python processes that:
  - Register with the server via WebSocket
  - Receive sensor assignments from server
  - Execute checks on schedule
  - Report results back to server
  - Support: ICMP ping, TCP port, HTTP(S), SNMP v1/v2c/v3, DNS, FTP, SMTP

### Sensor Types
| Type | Protocol | What it monitors |
|------|----------|-----------------|
| Ping | ICMP | Host up/down, latency, jitter |
| Port | TCP | Service availability |
| HTTP | HTTP/S | Website status, response time, content check |
| SNMP System | SNMP | Device uptime, hostname, contact, location |
| SNMP Interface | SNMP | Bandwidth in/out, errors, discards |
| SNMP CPU/Memory | SNMP | Device resource usage |
| SNMP Disk | SNMP | Storage usage |
| SNMP Custom | SNMP | Walk specific OIDs |
| DNS | DNS | Resolution time, record validation |
| SSL Certificate | HTTPS | Expiry date, validity |
| SNMP Switch Ports | SNMP | Port status, VLAN, speed, errors |
| SNMP Printer | SNMP | Toner, paper, tray status |
| SNMP UPS | SNMP | Battery, input/output power, runtime |

### SNMP MIB Support
Bundled MIBs for common devices:
- **Networking**: Cisco IOS/NX-OS, Arista, Juniper, Aruba, Ubiquiti, Mikrotik, HP/Aruba, Dell
- **Servers**: Windows Server, Linux NET-SNMP, Dell iDRAC, HP iLO
- **Printers**: HP, Brother, Ricoh, Xerox, Canon
- **UPS**: APC, CyberPower, Eaton
- **Storage**: Synology, QNAP, TrueNAS
- **Firewalls**: Palo Alto, Fortinet, SonicWall

Key OIDs pre-configured:
- `1.3.6.1.2.1.1` - System group (sysDescr, sysUpTime, sysContact, sysName, sysLocation)
- `1.3.6.1.2.1.2` - Interface group (ifTable, ifXTable)
- `1.3.6.1.2.1.25` - Host Resources (hrDevice, hrStorage, hrProcessor)
- `1.3.6.1.4.1.9.9` - Cisco enterprise (CPU, memory, temperature)
- `1.3.6.1.4.1.2636` - Juniper enterprise
- `1.3.6.1.4.1.318` - APC UPS
- `1.3.6.1.4.1.367` - Ricoh printer
- `1.3.6.1.4.1.11.2` - HP enterprise
- `1.3.6.1.4.1.8072` - NET-SNMP

### Network Device Backup
Supported protocols and devices:
| Vendor | Protocol | Command Set |
|--------|----------|-------------|
| Cisco IOS | SSH/Telnet | `show running-config`, `show startup-config` |
| Cisco NX-OS | SSH | `show running-config` |
| Juniper Junos | SSH | `show configuration | display set` |
| Arista EOS | SSH | `show running-config` |
| HP/Aruba | SSH | `show running-config` |
| Mikrotik | SSH/API | `/export` |
| Ubiquiti EdgeSwitch | SSH | `show running-config` |
| Palo Alto | SSH/API | `show config running` |
| Fortinet | SSH | `config full-configuration` |
| Dell | SSH | `show running-config` |

### Data Model
```sql
-- Probes
monitoring_probe (
  id, name, probe_uuid, site_id, probe_type,  -- server/client
  ip_address, last_seen, status, version
)

-- Sensor Groups (organizational)
monitoring_group (
  id, name, site_id, parent_id, icon
)

-- Sensors
monitoring_sensor (
  id, group_id, probe_id, sensor_type,
  target_host, target_port,
  snmp_version, snmp_community, snmp_auth,  -- SNMP creds
  ssh_username, ssh_password, ssh_enable,   -- Backup creds
  interval_seconds, timeout_seconds,
  threshold_warning, threshold_critical,
  enabled, paused, last_check, last_value,
  status,  -- ok, warning, critical, unknown, down
  tags
)

-- Sensor Readings (time-series)
monitoring_reading (
  id, sensor_id, timestamp,
  value_float, value_text,
  status  -- ok, warning, critical
)

-- Network Backups
monitoring_backup (
  id, sensor_id, timestamp,
  config_text, diff_from_last,
  backup_type  -- running, startup, full
)
```

### API Endpoints
```
# Probes
POST   /v2/monitoring/probes/           - Register/update probe
GET    /v2/monitoring/probes/            - List probes
GET    /v2/monitoring/probes/{id}        - Probe detail
DELETE /v2/monitoring/probes/{id}        - Remove probe

# Sensor Groups
CRUD   /v2/monitoring/groups/

# Sensors
CRUD   /v2/monitoring/sensors/
POST   /v2/monitoring/sensors/discover/  - Auto-discover devices
POST   /v2/monitoring/sensors/{id}/pause/
POST   /v2/monitoring/sensors/{id}/resume/
GET    /v2/monitoring/sensors/{id}/history/  - Time-series data

# Readings
POST   /v2/monitoring/readings/         - Submit readings (from probe)
GET    /v2/monitoring/readings/latest/    - Latest for all sensors

# Network Backups
GET    /v2/monitoring/backups/{sensor_id}/
POST   /v2/monitoring/backups/{sensor_id}/trigger/
GET    /v2/monitoring/backups/{sensor_id}/diff/  - Compare two versions

# Dashboard
GET    /v2/monitoring/dashboard/         - Summary stats
GET    /v2/monitoring/topology/           - Network map data
```

### Probe ↔ Server Protocol (WebSocket)
```json
// Probe connects to: /ws/monitoring/{probe_uuid}/
// Server assigns sensors:
{"type": "sensor_assign", "sensors": [{"id": 1, "type": "ping", "target": "10.10.0.1", "interval": 60, ...}]}

// Probe reports results:
{"type": "reading", "sensor_id": 1, "timestamp": "...", "value": 1.23, "status": "ok"}

// Server adds/removes sensors:
{"type": "sensor_add", "sensor": {...}}
{"type": "sensor_remove", "sensor_id": 5}

// Backup trigger:
{"type": "backup_trigger", "sensor_id": 10, "commands": ["show running-config"]}
```

### Frontend Components
1. **MonitoringDashboard** - Overview with status tiles, top issues, bandwidth charts
2. **ProbeManager** - Deploy/manage probes, see probe status
3. **SensorTree** - PRTG-style tree view of groups/sensors with status icons
4. **SensorDetail** - Time-series graphs, reading history, configuration
5. **SensorDiscovery** - Network scanner to auto-find devices
6. **NetworkBackups** - Config versions, diffs, scheduling
7. **SNMPBrowser** - Walk OIDs, test SNMP credentials
8. **AlertRules** - Threshold-based alerting configuration

### Probe Script (Python)
Lightweight, single-file, auto-installs deps:
- `pysnmp` for SNMP
- `icmplib` for ping
- `paramiko` for SSH backups
- `asyncio` for concurrent checks
- Reports via WebSocket to server

### Phased Build Plan
- **Phase 1**: Database models, API, probe registration
- **Phase 2**: Sensor types (ping, port, HTTP, SNMP system/interface)
- **Phase 3**: Probe agent script, WebSocket protocol
- **Phase 4**: Frontend - dashboard, sensor tree, sensor detail with graphs
- **Phase 5**: Auto-discovery, SNMP MIB browser
- **Phase 6**: Network device backups (SSH + config diff)
- **Phase 7**: Alerting rules, notifications