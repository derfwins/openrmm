#!/bin/bash
# OpenRMM Deployment Script
# Pushes latest code to 10.10.0.122 and restarts containers

set -e

SERVER="fhowland@10.10.0.122"
REMOTE_DIR="/opt/openrmm"
SSH_CMD="sshpass -p 'fxp20Vfh!!' ssh -o StrictHostKeyChecking=no $SERVER"

echo "📦 Syncing files to server..."
sshpass -p 'fxp20Vfh!!' rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude 'dist' \
  ./ $SERVER:$REMOTE_DIR/

echo "🔨 Rebuilding and restarting containers..."
sshpass -p 'fxp20Vfh!!' ssh -o StrictHostKeyChecking=no $SERVER bash -c "
  cd $REMOTE_DIR

  # Pull latest code changes
  echo 'Pulling latest...'
  
  # Rebuild backend if Dockerfile changed
  echo 'fxp20Vfh!!' | sudo -S docker compose build backend 2>/dev/null

  # Restart all services
  echo 'fxp20Vfh!!' | sudo -S docker compose up -d --force-recreate frontend 2>/dev/null
  echo 'fxp20Vfh!!' | sudo -S docker compose restart backend celery-worker celery-beat 2>/dev/null

  # Run migrations
  echo 'fxp20Vfh!!' | sudo -S docker compose exec backend python manage.py migrate --noinput 2>/dev/null

  echo '✅ Deployment complete!'
  echo 'fxp20Vfh!!' | sudo -S docker compose ps 2>/dev/null
"

echo "🎉 Deploy finished!"