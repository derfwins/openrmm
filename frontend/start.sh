#!/bin/bash
# Quick start script for OpenRMM frontend

cd /home/fhowland/.openclaw/workspace/openrmm/frontend

# Check if dist exists
if [ ! -d "dist" ]; then
    echo "Building frontend..."
    npm run build
fi

# Start Python HTTP server
echo "Starting OpenRMM frontend on http://localhost:8080"
cd dist && python3 -m http.server 8080
