# Remote Management Features Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add Ctrl+Alt+Del to remote desktop, enterprise-grade troubleshooting script library, and MSI/software remote deployment to OpenRMM.

**Architecture:** Three feature areas with shared infrastructure: (1) SAS (Secure Attention Sequence) injection over the existing WebRTC DataChannel, (2) a curated script library with categories covering common troubleshooting scenarios, (3) file upload + remote execution pipeline for MSI/exe/software deployment. All leverage the existing agent WebSocket connection and `run_command` infrastructure.

**Tech Stack:** Python (agent), TypeScript/React (frontend), FastAPI (backend), PostgreSQL (storage), aiortc/WebRTC DataChannel (SAS delivery)

---

## Feature 1: Ctrl+Alt+Del (Secure Attention Sequence)

### How It Works on Windows

Windows intercepts Ctrl+Alt+Del at the Win32k level (KBDLL_HOOK_FLAG_LLM_LL_FLAG) — `SendInput` cannot simulate it. The only way to trigger SAS programmatically is:

1. **`SASWindow` API** — undocumented, but `SASWindow.exe` in `C:\Windows\System32` can be invoked via `CreateProcessAsUser` from a SYSTEM process
2. **`EventCreateSAS`** — Windows 10+ provides a documented API in `sas.dll` but requires special signing
3. **The practical approach**: The agent already runs as SYSTEM. Use `CreateProcessAsUser` to spawn a process in the user's session that calls `LockWorkStation()`, or better, use the **`TsCon` + `SAS` trick**: On Windows 10/11, running `powershell -Command "(& {Add-Type -MemberDefinition '[DllImport(\"user32.dll\")]` public static extern bool LockWorkStation();' -Name 'Win32' -Namespace 'SAS' -PassThru)::LockWorkStation()"` as the interactive user triggers the lock screen (equivalent to Ctrl+Alt+Del security screen).

**Best enterprise approach**: Provide three SAS-related actions:
- **Lock Workstation** — calls `LockWorkStation()` via the input helper (session 1 user process)
- **Ctrl+Alt+Del** — uses `EventCreateSAS` API via ctypes from the SYSTEM agent  
- **Sign out user** — terminates the user session gracefully

### Task 1.1: Add SAS event type to input_helper.py

**Objective:** Add `sas_event` handler to the named pipe input helper that can trigger Ctrl+Alt+Del, Lock Workstation, and Sign Out.

**Files:**
- Modify: `agent/input_helper.py`

**Step 1: Add SAS handler functions**

```python
# Add after inject_keyboard() function

def inject_sas(event):
    """Trigger Secure Attention Sequence (Ctrl+Alt+Del) or related actions.
    
    Windows blocks SendInput for Ctrl+Alt+Del. Instead we use:
    - 'lock': LockWorkStation() API
    - 'sas': EventCreateSAS() via sas.dll (Windows 10+)
    - 'signout': ExitWindowsEx() with EWX_LOGOFF
    """
    action = event.get("action", "lock")
    
    if action == "lock":
        # LockWorkStation — blocks input, shows lock screen
        user32.LockWorkStation()
        log(f"SAS: Lock workstation")
    
    elif action == "sas":
        # Try EventCreateSAS (documented Win10+ API via sas.dll)
        # Falls back to LockWorkStation if unavailable
        try:
            sas_dll = ctypes.windll.sas
            # EventCreateSAS(0, 0, 0) — triggers the SAS sequence
            result = sas_dll.EventCreateSAS(0, 0, 0)
            log(f"SAS: EventCreateSAS result={result}")
            if not result:
                # Fallback: lock workstation
                user32.LockWorkStation()
                log(f"SAS: EventCreateSAS failed, fell back to LockWorkStation")
        except Exception as e:
            log(f"SAS: sas.dll not available ({e}), falling back to LockWorkStation")
            user32.LockWorkStation()
    
    elif action == "signout":
        # EWX_LOGOFF = 0, SHTDN_REASON_MAJOR_OTHER = 0x00000000
        advapi32 = ctypes.windll.advapi32
        success = advapi32.ExitWindowsEx(0, 0)
        log(f"SAS: Sign out result={success}")
```

**Step 2: Route SAS events in the named pipe handler**

In the main loop where `inject_mouse` and `inject_keyboard` are dispatched, add:

```python
elif evt.get("type") == "sas":
    inject_sas(evt)
```

---

### Task 1.2: Add SAS message handler to agent WebSocket

**Objective:** Agent receives `sas` messages over the WebRTC DataChannel and routes them to the input helper via named pipe.

**Files:**
- Modify: `agent/webrtc_desktop.py` — add SAS handler in DataChannel `on_message`

**Step 1: Handle SAS events in DataChannel on_message**

In the `on_message` callback of the input DataChannel, add handling for SAS events:

```python
elif data.get("type") == "sas":
    # Forward SAS event to input helper via named pipe
    if input_pipe:
        try:
            sas_event = json.dumps({"type": "sas", "action": data.get("action", "lock")})
            input_pipe.write(sas_event + "\n")
            input_pipe.flush()
        except Exception as e:
            log.warning(f"Failed to send SAS event: {e}")
```

This goes alongside the existing `"mouse"` and `"keyboard"` event handlers.

---

### Task 1.3: Add Ctrl+Alt+Del button to RemoteDesktop frontend

**Objective:** Add a SAS button to the remote desktop toolbar that sends the `sas` event via the DataChannel.

**Files:**
- Modify: `frontend/src/components/RemoteDesktop.tsx`

**Step 1: Add SAS button to toolbar**

Add a dropdown button next to the existing quality/view-only controls:

```tsx
{ /* Ctrl+Alt+Del button group */ }
<div className="flex items-center gap-1">
  <button
    onClick={() => sendSas('lock')}
    className="px-2 py-1 text-xs bg-orange-600 hover:bg-orange-500 rounded"
    title="Lock Workstation"
  >
    🔒 Lock
  </button>
  <button
    onClick={() => sendSas('sas')}
    className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded"
    title="Ctrl+Alt+Del"
  >
    ⌨️ Ctrl+Alt+Del
  </button>
  <button
    onClick={() => sendSas('signout')}
    className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded"
    title="Sign Out User"
  >
    🚪 Sign Out
  </button>
</div>
```

**Step 2: Add `sendSas` function**

```tsx
const sendSas = useCallback((action: string) => {
  if (dcRef.current?.readyState === 'open') {
    dcRef.current.send(JSON.stringify({ type: 'sas', action }))
  }
}, [])
```

---

## Feature 2: Enterprise Troubleshooting Scripts

### Script Categories

Enterprise RMM tools (Datto RMM, N-Able, ConnectWise) typically include these script categories:

| Category | Scripts |
|---|---|
| **Diagnostics** | System Info Dump, Network Diagnostics, Disk Health Check, Memory Test, Driver Query, Boot Config |
| **Network** | Flush DNS, Reset TCP/IP, Reset Winsock, Test-Connection (ping traceroute), Port Scan, Wi-Fi Profiles |
| **Cleanup** | Clear Temp Files, Clear Browser Cache, Disk Cleanup, Remove Old Profiles, Clear Windows Update Cache |
| **Repair** | SFC Scan, DISM Repair, Re-register Store Apps, Reset Windows Update, Repair WMI, Rebuild Performance Counters |
| **Security** | Firewall Audit, Check AV Status, List Open Ports, Check Local Admins, Audit Scheduled Tasks, List Startup Items |
| **Power Management** | Wake-on-LAN config, Power Plan Audit, Sleep/Hibernate settings, Battery Report |
| **Deployment Helpers** | Install PowerShell 7, Install .NET Runtime, Install VC++ Redists, Set Execution Policy |

### Task 2.1: Backend — Add `run_script` agent WS message handler

**Objective:** Agent receives a `run_script` message with script content (not just a one-liner command), writes it to a temp file, executes it, and streams output back.

**Files:**
- Modify: `agent/openrmm-agent.py` — add `run_script` message handler in WS loop

**Step 1: Add run_script handler**

This is different from `run_command` which runs a one-liner. `run_script` takes a full script body, writes it to a temp file, and executes it with the correct interpreter:

```python
elif msg_type == "run_script":
    script_id = data.get("script_id", "adhoc")
    script_body = data.get("script_body", "")
    shell = data.get("shell", "powershell")  # powershell, bash, python
    timeout = data.get("timeout", 300)
    session_id = data.get("session_id", f"script-{script_id}")
    
    log.info(f"Running script id={script_id} shell={shell}")
    
    def _run_script():
        import tempfile
        # Determine extension and interpreter
        if shell == "powershell":
            suffix = ".ps1"
            cmd_prefix = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]
        elif shell == "bash":
            suffix = ".sh"
            cmd_prefix = ["bash"]
        elif shell == "python":
            suffix = ".py"
            cmd_prefix = [sys.executable]
        else:
            suffix = ".ps1"
            cmd_prefix = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]
        
        # Write script to temp file
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix=suffix, delete=False, encoding='utf-8')
        tmp.write(script_body)
        tmp.close()
        
        try:
            result = subprocess.run(
                cmd_prefix + [tmp.name],
                capture_output=True, text=True, timeout=timeout
            )
            output = f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}\nRETURN CODE: {result.returncode}"
            return output, result.returncode
        except subprocess.TimeoutExpired:
            return f"TIMEOUT: Script exceeded {timeout} seconds", -1
        except Exception as e:
            return f"ERROR: {str(e)}", -1
        finally:
            try:
                os.unlink(tmp.name)
            except:
                pass
    
    try:
        output, rc = await asyncio.to_thread(_run_script)
        await ws.send(json.dumps({
            "type": "script_result",
            "session_id": session_id,
            "script_id": script_id,
            "success": rc == 0,
            "output": output[:50000],  # Larger limit for scripts
            "return_code": rc
        }))
    except Exception as e:
        log.error(f"run_script error: {e}", exc_info=True)
        await ws.send(json.dumps({
            "type": "script_result",
            "session_id": session_id,
            "script_id": script_id,
            "success": False,
            "output": f"ERROR: {str(e)}"
        }))
```

---

### Task 2.2: Backend — Add script execution API endpoints

**Objective:** REST API to dispatch a script to one or more agents and collect results.

**Files:**
- Modify: `api/v2/routers/scripts.py` — add `POST /scripts/{pk}/run/` and `POST /scripts/run-adhoc/`
- Modify: `api/v2/models/script.py` — add `ScriptExecution` model for results

**Step 1: Add ScriptExecution model**

```python
class ScriptExecution(Base):
    __tablename__ = "scripts_execution"
    
    id = Column(Integer, primary_key=True, index=True)
    script_id = Column(Integer, ForeignKey("scripts_script.id", ondelete="SET NULL"), nullable=True)
    agent_id = Column(String(255), nullable=False)
    session_id = Column(String(255), default="", server_default="")
    status = Column(String(50), default="pending", server_default="pending")  # pending, running, completed, failed, timeout
    output = Column(Text, default="", server_default="")
    return_code = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_by = Column(String(255), default="", server_default="")
    created_at = Column(DateTime, server_default=func.now())
```

**Step 2: Add migration for new table**

Create `api/v2/migrations/007_script_execution_table.py`

**Step 3: Add run endpoints**

```python
class ScriptRunRequest(BaseModel):
    agent_ids: list[str]
    timeout: int = 300

class AdhocScriptRequest(BaseModel):
    name: str = "Ad-hoc Script"
    script_body: str
    shell: str = "powershell"  # powershell, bash, python
    agent_ids: list[str]
    timeout: int = 300


@router.post("/{pk}/run/")
async def run_script(pk: int, req: ScriptRunRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Dispatch a saved script to one or more agents."""
    result = await db.execute(select(Script).where(Script.id == pk))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(404, "Script not found")
    
    executions = []
    for agent_id in req.agent_ids:
        session_id = str(uuid.uuid4())
        exec_ = ScriptExecution(
            script_id=script.id,
            agent_id=agent_id,
            session_id=session_id,
            status="pending",
            created_by=user.username,
            started_at=func.now(),
        )
        db.add(exec_)
        executions.append(exec_)
        
        # Send to agent via WS
        agent_ws = agent_connections.get(agent_id)
        if agent_ws:
            await agent_ws.send_json({
                "type": "run_script",
                "script_id": str(script.id),
                "script_body": script.script_body,
                "shell": script.shell,
                "timeout": req.timeout,
                "session_id": session_id,
            })
        else:
            exec_.status = "failed"
            exec_.output = "Agent offline"
    
    await db.commit()
    return {"dispatched": len(executions), "session_ids": [e.session_id for e in executions]}


@router.post("/run-adhoc/")
async def run_adhoc_script(req: AdhocScriptRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Run an ad-hoc script (not saved to library) on one or more agents."""
    executions = []
    for agent_id in req.agent_ids:
        session_id = str(uuid.uuid4())
        exec_ = ScriptExecution(
            agent_id=agent_id,
            session_id=session_id,
            status="pending",
            created_by=user.username,
            started_at=func.now(),
        )
        db.add(exec_)
        executions.append(exec_)
        
        agent_ws = agent_connections.get(agent_id)
        if agent_ws:
            await agent_ws.send_json({
                "type": "run_script",
                "script_id": "adhoc",
                "script_body": req.script_body,
                "shell": req.shell,
                "timeout": req.timeout,
                "session_id": session_id,
            })
        else:
            exec_.status = "failed"
            exec_.output = "Agent offline"
    
    await db.commit()
    return {"dispatched": len(executions), "session_ids": [e.session_id for e in executions]}


@router.get("/executions/")
async def list_executions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """List recent script executions with results."""
    result = await db.execute(
        select(ScriptExecution).order_by(ScriptExecution.created_at.desc()).limit(100)
    )
    executions = result.scalars().all()
    return [
        {
            "id": e.id,
            "script_id": e.script_id,
            "agent_id": e.agent_id,
            "session_id": e.session_id,
            "status": e.status,
            "output": e.output[:5000],
            "return_code": e.return_code,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            "created_by": e.created_by,
        }
        for e in executions
    ]
```

---

### Task 2.3: Backend — Handle `script_result` from agent

**Objective:** When agent sends `script_result` back over WS, update the ScriptExecution record in the database.

**Files:**
- Modify: `api/v2/routers/ws_state.py` — handle `script_result` message type

In the agent WS message handler, add:

```python
elif msg_type == "script_result":
    session_id = data.get("session_id", "")
    # Update ScriptExecution record
    from v2.models.script import ScriptExecution
    result = await db.execute(select(ScriptExecution).where(ScriptExecution.session_id == session_id))
    execution = result.scalar_one_or_none()
    if execution:
        execution.status = "completed" if data.get("success") else "failed"
        execution.output = data.get("output", "")
        execution.return_code = data.get("return_code")
        execution.completed_at = func.now()
        await db.commit()
```

---

### Task 2.4: Seed built-in troubleshooting scripts

**Objective:** Populate the script library with enterprise-grade troubleshooting scripts on first run or via migration.

**Files:**
- Create: `api/v2/routers/scripts_builtin.py` — registry of built-in scripts
- Modify: `api/v2/main.py` — call seed function on startup

**Step 1: Create built-in script registry**

This file defines the scripts as Python dicts with name, description, category, shell, and body. Key scripts:

```python
BUILTIN_SCRIPTS = [
    # --- Diagnostics ---
    {
        "name": "System Information Report",
        "description": "Collect comprehensive system info: OS, hardware, disks, network, services, running processes",
        "category": "Diagnostics",
        "shell": "powershell",
        "script_body": """...full PowerShell script...""",
    },
    {
        "name": "Network Diagnostics",
        "description": "IP config, DNS test, traceroute, adapter info, routing table",
        "category": "Network",
        "shell": "powershell", 
        "script_body": """...""",
    },
    {
        "name": "Disk Health Check",
        "description": "SMART status, disk space, volume info, chkdsk schedule status",
        "category": "Diagnostics",
        "shell": "powershell",
        "script_body": """...""",
    },
    
    # --- Network Repair ---
    {
        "name": "Flush DNS & Reset Network",
        "description": "Flush DNS cache, reset Winsock, reset TCP/IP stack, release/renew IP",
        "category": "Network",
        "shell": "powershell",
        "script_body": """...""",
    },
    
    # --- Cleanup ---
    {
        "name": "Clear Temp Files & Caches",
        "description": "Clear Windows Temp, user temp, browser caches, thumbnail cache",
        "category": "Cleanup",
        "shell": "powershell",
        "script_body": """...""",
    },
    
    # --- Repair ---
    {
        "name": "SFC & DISM System Repair",
        "description": "Run System File Checker and DISM restore health scan",
        "category": "Repair",
        "shell": "powershell",
        "script_body": """...""",
    },
    {
        "name": "Reset Windows Update",
        "description": "Restart WU services, delete SoftwareDistribution, re-register DLLs",
        "category": "Repair",
        "shell": "powershell",
        "script_body": """...""",
    },
    {
        "name": "Repair WMI Repository",
        "description": "Verify and rebuild WMI repository if corrupted",
        "category": "Repair",
        "shell": "powershell",
        "script_body": """...""",
    },
    
    # --- Security ---
    {
        "name": "Security Audit Quick Scan",
        "description": "Firewall status, AV status, local admins, open ports, scheduled tasks, startup items",
        "category": "Security",
        "shell": "powershell",
        "script_body": """...""",
    },
    {
        "name": "Check Windows Defender Status",
        "description": "Defender signature age, real-time protection, exclusions, last scan time",
        "category": "Security",
        "shell": "powershell",
        "script_body": """...""",
    },
    
    # --- Power ---
    {
        "name": "Power Configuration Report",
        "description": "Current power plan, sleep/hibernate settings, WOL capability, battery health",
        "category": "Power Management",
        "shell": "powershell",
        "script_body": """...""",
    },
]
```

**Step 2: Seed function**

```python
async def seed_builtin_scripts(db: AsyncSession):
    """Insert built-in scripts if they don't already exist."""
    from v2.models.script import Script
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
                script_body=builtin["script_body"],
                script_type=builtin["shell"],
                timeout=300,
                created_by="system",
            )
            db.add(script)
    await db.commit()
```

---

### Task 2.5: Frontend — Update ScriptLibrary with categories and execution results

**Objective:** Add category filtering for built-in scripts, show execution status, add "Run on selected agents" workflow.

**Files:**
- Modify: `frontend/src/components/ScriptLibrary.tsx` — add new categories, execution polling
- Modify: `frontend/src/services/apiService.ts` — add script execution API calls

**Key changes:**
1. Add built-in categories to filter: `Diagnostics`, `Network`, `Cleanup`, `Repair`, `Security`, `Power Management`
2. Add `apiService.runScript(scriptId, agentIds)` and `apiService.runAdhocScript(body, shell, agentIds)` 
3. Show execution results panel with polling for `script_result` updates
4. Add "Quick Actions" for one-click common scripts (Flush DNS, SFC Scan, System Info)

---

## Feature 3: Remote Software Deployment (MSI/EXE)

### Architecture

```
Browser → Upload MSI → Backend stores to /opt/openrmm/uploads/
       → Schedule deployment → Backend sends "install_package" to agent WS
       → Agent downloads from backend HTTPS URL
       → Agent runs msiexec /i or exe with args
       → Agent reports install result back via WS
```

### Task 3.1: Backend — File upload endpoint

**Objective:** Upload MSI/EXE files to the server, store them, get a deployment URL.

**Files:**
- Modify: `api/v2/routers/scripts.py` — add upload endpoint (or create new `packages.py` router)
- Add migration for `packages` table

**Step 1: Package model**

```python
class Package(Base):
    __tablename__ = "packages_package"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="", server_default="")
    filename = Column(String(255), nullable=False)  # original filename
    file_path = Column(String(512), nullable=False)  # server-side path
    file_size = Column(Integer, default=0)
    file_hash = Column(String(64), default="", server_default="")  # SHA-256
    package_type = Column(String(50), default="msi", server_default="msi")  # msi, exe, ps1
    install_args = Column(Text, default="", server_default="")  # e.g. "/qn /norestart"
    uninstall_args = Column(Text, default="", server_default="")  # e.g. "/x {GUID} /qn"
    created_by = Column(String(255), default="", server_default="")
    created_at = Column(DateTime, server_default=func.now())
```

**Step 2: Upload endpoint**

```python
@router.post("/packages/upload/")
async def upload_package(
    file: UploadFile,
    name: str = Form(""),
    description: str = Form(""),
    install_args: str = Form(""),
    uninstall_args: str = Form(""),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Save to /opt/openrmm/uploads/
    upload_dir = Path("/opt/openrmm/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    safe_name = file.filename.replace("..", "").replace("/", "")
    dest = upload_dir / f"{uuid.uuid4().hex}_{safe_name}"
    
    file_hash = hashlib.sha256()
    file_size = 0
    with open(dest, "wb") as f:
        while chunk := await file.read(65536):
            f.write(chunk)
            file_hash.update(chunk)
            file_size += len(chunk)
    
    package = Package(
        name=name or file.filename,
        description=description,
        filename=file.filename,
        file_path=str(dest),
        file_size=file_size,
        file_hash=file_hash.hexdigest(),
        package_type=Path(file.filename).suffix.lstrip(".").lower(),
        install_args=install_args,
        uninstall_args=uninstall_args,
        created_by=user.username,
    )
    db.add(package)
    await db.commit()
    await db.refresh(package)
    
    return {"id": package.id, "name": package.name, "filename": package.filename, "size": file_size}
```

**Step 3: Deploy endpoint**

```python
class PackageDeployRequest(BaseModel):
    agent_ids: list[str]
    install_args: str = ""  # Override stored args

@router.post("/packages/{pk}/deploy/")
async def deploy_package(pk: int, req: PackageDeployRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Deploy a package to one or more agents."""
    result = await db.execute(select(Package).where(Package.id == pk))
    package = result.scalar_one_or_none()
    if not package:
        raise HTTPException(404, "Package not found")
    
    # Build download URL
    download_url = f"{settings.SERVER_URL}/v2/packages/{pk}/download/"
    
    executions = []
    for agent_id in req.agent_ids:
        session_id = str(uuid.uuid4())
        
        # Send to agent via WS
        agent_ws = agent_connections.get(agent_id)
        if agent_ws:
            await agent_ws.send_json({
                "type": "install_package",
                "package_id": str(package.id),
                "package_name": package.name,
                "package_type": package.package_type,
                "download_url": download_url,
                "filename": package.filename,
                "install_args": req.install_args or package.install_args,
                "uninstall_args": package.uninstall_args,
                "file_hash": package.file_hash,
                "session_id": session_id,
            })
            status = "pending"
        else:
            status = "failed"
        
        exec_ = PackageExecution(
            package_id=package.id,
            agent_id=agent_id,
            session_id=session_id,
            status=status,
            created_by=user.username,
        )
        db.add(exec_)
        executions.append(exec_)
    
    await db.commit()
    return {"dispatched": len(executions)}
```

**Step 4: Download endpoint** (agent fetches the file)

```python
@router.get("/packages/{pk}/download/")
async def download_package(pk: int, user: User = Depends(get_current_user)):
    """Download a package file. Agent uses token auth."""
    # Note: agent needs a way to auth — use a short-lived download token
    result = await db.execute(select(Package).where(Package.id == pk))
    package = result.scalar_one_or_none()
    if not package:
        raise HTTPException(404)
    return FileResponse(package.file_path, filename=package.filename)
```

---

### Task 3.2: Backend — Package download token for agents

**Objective:** Generate short-lived tokens that the agent can use to download packages without persistent credentials.

**Files:**
- Add to `api/v2/routers/scripts.py` or new `packages.py`

**Approach:** Generate a UUID download token, store it in the `install_package` message, and add a `/packages/download/{token}/` endpoint that requires no auth but validates the token.

```python
# In-memory map: token → package_id (expires after 1 hour)
download_tokens: dict[str, tuple[int, float]] = {}

@router.get("/packages/download/{token}/")
async def download_package_by_token(token: str):
    """Agent downloads package using one-time token."""
    if token not in download_tokens:
        raise HTTPException(403, "Invalid or expired download token")
    pkg_id, expires = download_tokens.pop(token)
    if time.time() > expires:
        raise HTTPException(403, "Download token expired")
    
    result = await db.execute(select(Package).where(Package.id == pkg_id))
    package = result.scalar_one_or_none()
    if not package:
        raise HTTPException(404)
    return FileResponse(package.file_path, filename=package.filename)
```

---

### Task 3.3: Agent — Add `install_package` WS handler

**Objective:** Agent receives `install_package` message, downloads the file, installs it, and reports result.

**Files:**
- Modify: `agent/openrmm-agent.py`

**Step 1: Add install_package handler**

```python
elif msg_type == "install_package":
    download_url = data.get("download_url", "")
    filename = data.get("filename", "package.msi")
    package_type = data.get("package_type", "msi")
    install_args = data.get("install_args", "")
    session_id = data.get("session_id", "pkg-install")
    file_hash = data.get("file_hash", "")
    package_name = data.get("package_name", "unknown")
    
    log.info(f"Installing package: {package_name} ({filename})")
    
    def _install_package():
        import tempfile
        import urllib.request
        
        # Download to temp
        tmp_dir = tempfile.mkdtemp(prefix="openrmm_pkg_")
        tmp_file = os.path.join(tmp_dir, filename)
        
        try:
            urllib.request.urlretrieve(download_url, tmp_file)
            
            # Verify hash if provided
            if file_hash:
                import hashlib
                with open(tmp_file, "rb") as f:
                    actual_hash = hashlib.sha256(f.read()).hexdigest()
                if actual_hash != file_hash:
                    return "FAILED", f"Hash mismatch: expected {file_hash}, got {actual_hash}", -1
            
            # Install
            if package_type == "msi":
                cmd = f'msiexec /i "{tmp_file}" {install_args}'
            elif package_type == "exe":
                cmd = f'"{tmp_file}" {install_args}'
            elif package_type == "msix":
                cmd = f'powershell -Command "Add-AppxPackage -Path \'{tmp_file}\'"'
            else:
                cmd = f'"{tmp_file}" {install_args}'
            
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=600)
            status = "COMPLETED" if result.returncode == 0 else "FAILED"
            output = f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}\nEXIT: {result.returncode}"
            return status, output, result.returncode
            
        except Exception as e:
            return "FAILED", f"ERROR: {str(e)}", -1
        finally:
            # Clean up temp file
            try:
                shutil.rmtree(tmp_dir)
            except:
                pass
    
    try:
        status, output, rc = await asyncio.to_thread(_install_package)
        await ws.send(json.dumps({
            "type": "install_result",
            "session_id": session_id,
            "status": status,
            "output": output[:50000],
            "return_code": rc,
        }))
    except Exception as e:
        await ws.send(json.dumps({
            "type": "install_result", 
            "session_id": session_id,
            "status": "FAILED",
            "output": f"ERROR: {str(e)}",
            "return_code": -1,
        }))
```

---

### Task 3.4: Backend — Handle `install_result` from agent

**Objective:** When agent reports install result, update the PackageExecution record.

**Files:**
- Modify: `api/v2/routers/ws_state.py` — handle `install_result` message type
- Add `PackageExecution` model

**Step 1: PackageExecution model**

```python
class PackageExecution(Base):
    __tablename__ = "packages_execution"
    
    id = Column(Integer, primary_key=True, index=True)
    package_id = Column(Integer, ForeignKey("packages_package.id", ondelete="SET NULL"), nullable=True)
    agent_id = Column(String(255), nullable=False)
    session_id = Column(String(255), default="", server_default="")
    status = Column(String(50), default="pending", server_default="pending")
    output = Column(Text, default="", server_default="")
    return_code = Column(Integer, nullable=True)
    created_by = Column(String(255), default="", server_default="")
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
```

---

### Task 3.5: Frontend — Package management UI

**Objective:** Add UI for uploading, browsing, and deploying packages.

**Files:**
- Create: `frontend/src/components/PackageManager.tsx`
- Modify: `frontend/src/services/apiService.ts` — add package API calls
- Modify: Sidebar/routing — add route for `/packages`

**Key features:**
1. Upload area (drag & drop MSI/EXE)
2. Package list with name, type, size, created date
3. "Deploy to agents" modal — select agents, optionally override install args
4. Deployment status panel — shows per-agent status (pending/downloading/installing/completed/failed)

---

## Implementation Order

1. **Feature 1: Ctrl+Alt+Del** — smallest scope, immediate value
   - Task 1.1 → 1.2 → 1.3 → Deploy → Test

2. **Feature 2: Troubleshooting Scripts** — medium scope, high value
   - Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → Deploy → Test

3. **Feature 3: Software Deployment** — largest scope
   - Task 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → Deploy → Test

Each feature should be deployed and tested before starting the next.

---

## Security Considerations

- **Ctrl+Alt+Del**: The SAS API (`EventCreateSAS`) is only callable by SYSTEM. Agent already runs as SYSTEM. Lock/SignOut is appropriate for the remote desktop context.
- **Script execution**: Scripts run with the agent's privileges (SYSTEM on Windows). This is standard for RMM tools. Consider adding approval workflow for custom scripts in the future.
- **Package deployment**: File hash verification prevents tampering. Download tokens are one-time-use and expire after 1 hour. Consider adding package signing in the future.
- **Audit**: All script executions and package deployments should create audit log entries (the audit system already exists in `api/v2/routers/audit.py`).

---

## Testing Checklist

### Ctrl+Alt+Del
- [ ] Lock Workstation from remote desktop toolbar → agent's screen locks
- [ ] Ctrl+Alt+Del from remote desktop toolbar → SAS screen appears
- [ ] Sign Out from remote desktop toolbar → user session ends

### Troubleshooting Scripts
- [ ] Built-in scripts appear in Script Library
- [ ] Can filter by category (Diagnostics, Network, etc.)
- [ ] Run script on single agent → output displayed
- [ ] Run script on multiple agents → per-agent results
- [ ] Ad-hoc script execution works
- [ ] Script timeout enforced (default 300s)

### Software Deployment
- [ ] Upload MSI file → appears in package list
- [ ] Upload EXE file → appears in package list
- [ ] Deploy to agent → downloads and installs
- [ ] Hash verification works (rejects corrupted download)
- [ ] Deployment status updates in real-time
- [ ] Failed deployment shows error output