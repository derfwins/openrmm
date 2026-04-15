#!/bin/bash
# OpenRMM Agent Installer for Linux/Mac
# Run as root or with sudo
set -e

SERVER="${1:-}"
CLIENT_ID="${2:-0}"
SITE_ID="${3:-0}"
AGENT_TYPE="${4:-server}"

if [ -z "$SERVER" ] || [ "$CLIENT_ID" = "0" ] || [ "$SITE_ID" = "0" ]; then
    echo "Usage: sudo ./install.sh https://rmm.derfwins.com CLIENT_ID SITE_ID [server|workstation]"
    echo "Get these values from the Install Agent page in OpenRMM"
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Run with sudo!"
    exit 1
fi

echo "=== OpenRMM Agent Installer ==="
echo "Server: $SERVER"
echo "Client: $CLIENT_ID | Site: $SITE_ID | Type: $AGENT_TYPE"
echo ""

INSTALL_DIR="/opt/openrmm-agent"

# Check Python 3
if ! command -v python3 &>/dev/null; then
    echo "Python 3 not found. Installing..."
    if command -v apt &>/dev/null; then
        apt update && apt install -y python3 python3-pip
    elif command -v yum &>/dev/null; then
        yum install -y python3 python3-pip
    elif command -v brew &>/dev/null; then
        brew install python3
    else
        echo "ERROR: Cannot install Python 3 automatically. Install it manually and retry."
        exit 1
    fi
fi

echo "Python: $(python3 --version)"

# Install psutil
python3 -m pip install psutil --quiet 2>/dev/null || pip3 install psutil --quiet

# Create install directory
mkdir -p "$INSTALL_DIR"
cp openrmm-agent.py "$INSTALL_DIR/"
cp requirements.txt "$INSTALL_DIR/"
python3 -m pip install -r "$INSTALL_DIR/requirements.txt" --quiet 2>/dev/null || true

# Create systemd service
cat > /etc/systemd/system/openrmm-agent.service << EOF
[Unit]
Description=OpenRMM Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 $INSTALL_DIR/openrmm-agent.py --server $SERVER --client-id $CLIENT_ID --site-id $SITE_ID --agent-type $AGENT_TYPE
WorkingDirectory=$INSTALL_DIR
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable openrmm-agent
systemctl start openrmm-agent

echo ""
echo "=== Agent Installed Successfully! ==="
echo "Install dir: $INSTALL_DIR"
echo "Service: openrmm-agent (systemd)"
echo "Log: $INSTALL_DIR/agent.log"
echo ""
echo "Commands:"
echo "  systemctl status openrmm-agent"
echo "  journalctl -u openrmm-agent -f"
echo ""
echo "To uninstall: systemctl stop openrmm-agent; systemctl disable openrmm-agent; rm -rf $INSTALL_DIR /etc/systemd/system/openrmm-agent.service"