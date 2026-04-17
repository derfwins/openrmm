#!/bin/bash
# OpenRMM MeshCentral Integration Setup Script

set -e

MESH_DIR="/opt/openrmm/docker/meshcentral"
DATA_DIR="$MESH_DIR/data"

echo "Setting up MeshCentral data directory..."
mkdir -p "$DATA_DIR"

echo "Creating MeshCentral Docker network (if not exists)..."
docker network inspect openrmm-network >/dev/null 2>&1 || docker network create openrmm-network

echo "Done! MeshCentral will auto-initialize on first start."
echo ""
echo "Important: After MeshCentral starts, create your admin account:"
echo "  docker exec -it openrmm-meshcentral node meshcentral --createaccount admin --admin"
echo ""
echo "Then get the API token for OpenRMM integration:"
echo "  docker exec -it openrmm-meshcentral node meshcentral --getapitoken"