#!/bin/bash
# Deploy OpenRMM to production server
# Usage: ./deploy-server.sh [environment]

set -e

ENV=${1:-production}
SERVER_HOST=${2:-}
SERVER_USER=${3:-root}

echo "🚀 Deploying OpenRMM to $ENV environment..."

if [ -z "$SERVER_HOST" ]; then
    echo "❌ Error: Server host required"
    echo "Usage: ./deploy-server.sh production user@server.com"
    exit 1
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Build locally first
echo "🔨 Building locally..."
cd /home/fhowland/.openclaw/workspace/openrmm/frontend
npm run build

# Create deployment package
echo "📦 Creating deployment package..."
DEPLOY_DIR="/tmp/openrmm-deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p $DEPLOY_DIR

# Copy files
cp -r /home/fhowland/.openclaw/workspace/openrmm/frontend/dist $DEPLOY_DIR/frontend/
cp -r /home/fhowland/.openclaw/workspace/openrmm/api $DEPLOY_DIR/
cp /home/fhowland/.openclaw/workspace/openrmm/docker-compose.yml $DEPLOY_DIR/
cp /home/fhowland/.openclaw/workspace/openrmm/.env.example $DEPLOY_DIR/.env

# Create deploy script
cat > $DEPLOY_DIR/deploy-on-server.sh << 'EOF'
#!/bin/bash
cd /opt/openrmm

# Pull latest images
docker-compose pull || true

# Start services
docker-compose up -d

# Run migrations
docker-compose exec -T backend python manage.py migrate

# Collect static
docker-compose exec -T backend python manage.py collectstatic --noinput

echo "✅ Deployment complete"
EOF

chmod +x $DEPLOY_DIR/deploy-on-server.sh

# Transfer to server
echo "📤 Transferring to $SERVER_HOST..."
rsync -avz --delete $DEPLOY_DIR/ $SERVER_USER@$SERVER_HOST:/opt/openrmm/

# Run deploy on server
echo "🔧 Running deployment on server..."
ssh $SERVER_USER@$SERVER_HOST "cd /opt/openrmm && ./deploy-on-server.sh"

# Cleanup
rm -rf $DEPLOY_DIR

echo -e "${GREEN}"
echo "=========================================="
echo "🎉 Deployment Complete!"
echo "=========================================="
echo ""
echo "Your OpenRMM instance is now running at:"
echo "  http://$SERVER_HOST"
echo ""
echo "Next steps:"
echo "  1. Configure your domain DNS"
echo "  2. Set up SSL with Let's Encrypt"
echo "  3. Create admin user: docker-compose exec backend python manage.py createsuperuser"
echo "=========================================="
echo -e "${NC}"
