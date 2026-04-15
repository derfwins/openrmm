#!/bin/bash
# OpenRMM Agent Installer for Linux
# Run as root: sudo bash install-linux.sh

set -euo pipefail

# --- Config ---
SERVER_URL="${1:-}"
CLIENT="${2:-}"
SITE="${3:-}"
AGENT_TYPE="${4:-server}"
AUTH_TOKEN="${5:-}"
AGENT_VERSION="1.0.0"
AGENT_BINARY="openrmm-agent-${AGENT_VERSION}-linux-amd64"
DOWNLOAD_URL="${SERVER_URL}/api/agents/download/${AGENT_BINARY}"
INSTALL_DIR="/opt/openrmm/agent"
SERVICE_NAME="openrmm-agent"

echo "========================================"
echo "  OpenRMM Agent Installer for Linux"
echo "========================================"
echo ""

# --- Check root ---
if [ "$(id -u)" -ne 0 ]; then
    echo "[ERROR] This script must be run as root!"
    exit 1
fi

# --- Detect arch ---
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    GOARCH="amd64"
elif [ "$ARCH" = "aarch64" ]; then
    GOARCH="arm64"
else
    echo "[WARN] Unsupported architecture: $ARCH, using amd64"
    GOARCH="amd64"
fi

HOSTNAME=$(hostname)

# --- Enroll with server ---
echo "[1/5] Enrolling agent with server..."
ENROLL_RESP=$(curl -sf -X POST "${SERVER_URL}/api/agents/enroll/" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -d "{
        \"hostname\": \"${HOSTNAME}\",
        \"platform\": \"linux\",
        \"goarch\": \"${GOARCH}\",
        \"agent_type\": \"${AGENT_TYPE}\",
        \"client\": \"${CLIENT}\",
        \"site\": \"${SITE}\"
    }") || { echo "[ERROR] Enrollment failed!"; exit 1; }

AGENT_ID=$(echo "$ENROLL_RESP" | grep -o '"agent_id":"[^"]*"' | cut -d'"' -f4)
AGENT_SECRET=$(echo "$ENROLL_RESP" | grep -o '"secret":"[^"]*"' | cut -d'"' -f4)
echo "  Agent ID: ${AGENT_ID}"

# --- Download agent binary ---
echo "[2/5] Downloading agent binary..."
mkdir -p "${INSTALL_DIR}"

if curl -sf -o "${INSTALL_DIR}/${AGENT_BINARY}" "${DOWNLOAD_URL}"; then
    chmod +x "${INSTALL_DIR}/${AGENT_BINARY}"
    echo "  Download complete!"
else
    echo "[WARN] Download failed, creating heartbeat script fallback"
    cat > "${INSTALL_DIR}/heartbeat.sh" << 'HEARTBEAT_EOF'
#!/bin/bash
AGENT_ID="__AGENT_ID__"
SERVER_URL="__SERVER_URL__"
AGENT_SECRET="__AGENT_SECRET__"

while true; do
    curl -sf -X POST "${SERVER_URL}/api/agents/heartbeat/" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${AGENT_SECRET}" \
        -d "{\"agent_id\": \"${AGENT_ID}\"}" || true
    sleep 30
done
HEARTBEAT_EOF

    sed -i "s/__AGENT_ID__/${AGENT_ID}/g" "${INSTALL_DIR}/heartbeat.sh"
    sed -i "s/__SERVER_URL__/${SERVER_URL}/g" "${INSTALL_DIR}/heartbeat.sh"
    sed -i "s/__AGENT_SECRET__/${AGENT_SECRET}/g" "${INSTALL_DIR}/heartbeat.sh"
    chmod +x "${INSTALL_DIR}/heartbeat.sh"
fi

# --- Write config ---
echo "[3/5] Writing configuration..."
cat > "${INSTALL_DIR}/agent.conf" << EOF
[agent]
id = ${AGENT_ID}
server_url = ${SERVER_URL}
secret = ${AGENT_SECRET}

[heartbeat]
interval = 30

[nats]
url = ${SERVER_URL}:4222
EOF

# --- Install as systemd service ---
echo "[4/5] Installing systemd service..."
if [ -f "${INSTALL_DIR}/${AGENT_BINARY}" ]; then
    EXEC_START="${INSTALL_DIR}/${AGENT_BINARY}"
else
    EXEC_START="/bin/bash ${INSTALL_DIR}/heartbeat.sh"
fi

cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=OpenRMM Remote Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${EXEC_START}
WorkingDirectory=${INSTALL_DIR}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}

# --- Verify ---
echo "[5/5] Verifying installation..."
sleep 2
if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo "  Service is running!"
else
    echo "  [WARN] Service may need manual start: systemctl start ${SERVICE_NAME}"
fi

echo ""
echo "========================================"
echo "  Agent installed successfully!"
echo "  Agent ID: ${AGENT_ID}"
echo "========================================"