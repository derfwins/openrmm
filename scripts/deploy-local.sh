#!/bin/bash
# Deploy local OpenRMM repo to a server via rsync
# Usage: ./scripts/deploy-local.sh user@server:/path

set -e

SERVER=$1

if [ -z "$SERVER" ]; then
    echo "Usage: ./scripts/deploy-local.sh user@server:/opt/openrmm"
    exit 1
fi

echo "🚀 Deploying OpenRMM to $SERVER..."

# Create temp deploy archive
DEPLOY_DIR=$(mktemp -d)
cp -r . "$DEPLOY_DIR/openrmm"

# Remove git/dev files
rm -rf "$DEPLOY_DIR/openrmm/.git"
rm -rf "$DEPLOY_DIR/openrmm/frontend/node_modules"
rm -rf "$DEPLOY_DIR/openrmm/frontend/dist"

# Sync to server
echo "📤 Syncing files..."
rsync -avz --progress "$DEPLOY_DIR/openrmm/" "$SERVER/"

# Cleanup
rm -rf "$DEPLOY_DIR"

echo "✅ Files deployed to $SERVER"
echo ""
echo "Next steps on the server:"
echo "  cd /opt/openrmm"
echo "  docker-compose up -d"
echo ""
echo "Then access:"
echo "  Frontend: http://server-ip:5173"
echo "  API: http://server-ip:8000/api"
