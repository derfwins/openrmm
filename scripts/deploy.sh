#!/bin/bash
# OpenRMM Deployment Script
# Usage: ./deploy.sh [dev|staging|prod]

set -e

ENV=${1:-dev}
DOMAIN=${2:-rmm-test.derfwins.com}

echo "🚀 Deploying OpenRMM to $ENV environment..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    
    command -v docker >/dev/null 2>&1 || { echo -e "${RED}❌ Docker is required${NC}"; exit 1; }
    command -v docker-compose >/dev/null 2>&1 || { echo -e "${RED}❌ Docker Compose is required${NC}"; exit 1; }
    command -v git >/dev/null 2>&1 || { echo -e "${RED}❌ Git is required${NC}"; exit 1; }
    
    echo -e "${GREEN}✅ All prerequisites met${NC}"
}

# Pull latest code
pull_code() {
    echo "📥 Pulling latest code..."
    git pull origin main
    echo -e "${GREEN}✅ Code updated${NC}"
}

# Build containers
build_containers() {
    echo "🔨 Building containers..."
    docker-compose build --no-cache
    echo -e "${GREEN}✅ Containers built${NC}"
}

# Run migrations
run_migrations() {
    echo "🗄️ Running database migrations..."
    docker-compose run --rm backend python manage.py migrate
    echo -e "${GREEN}✅ Migrations complete${NC}"
}

# Collect static files
collect_static() {
    echo "📦 Collecting static files..."
    docker-compose run --rm backend python manage.py collectstatic --noinput
    echo -e "${GREEN}✅ Static files collected${NC}"
}

# Start services
start_services() {
    echo "🚀 Starting services..."
    docker-compose up -d
    echo -e "${GREEN}✅ Services started${NC}"
}

# Health check
health_check() {
    echo "🏥 Running health checks..."
    
    # Wait for services to be ready
    sleep 10
    
    # Check backend
    if curl -s http://localhost:8000/api/health/ > /dev/null; then
        echo -e "${GREEN}✅ Backend is healthy${NC}"
    else
        echo -e "${YELLOW}⚠️ Backend health check failed${NC}"
    fi
    
    # Check frontend
    if curl -s http://localhost:5173 > /dev/null; then
        echo -e "${GREEN}✅ Frontend is healthy${NC}"
    else
        echo -e "${YELLOW}⚠️ Frontend health check failed${NC}"
    fi
}

# Send notification
send_notification() {
    local status=$1
    local message=$2
    
    echo "📧 Sending notification..."
    echo -e "$message" | mail -s "OpenRMM Deploy $status" fred@derfwins.com 2>/dev/null || true
}

# Main deployment flow
main() {
    check_prerequisites
    pull_code
    build_containers
    run_migrations
    collect_static
    start_services
    health_check
    
    echo -e "${GREEN}"
    echo "=========================================="
    echo "🎉 OpenRMM deployed successfully!"
    echo "=========================================="
    echo ""
    echo "Frontend: http://$DOMAIN"
    echo "Backend API: http://$DOMAIN/api"
    echo ""
    echo "Services:"
    echo "  - Backend: http://localhost:8000"
    echo "  - Frontend: http://localhost:5173"
    echo "  - PostgreSQL: localhost:5432"
    echo "  - Redis: localhost:6379"
    echo "=========================================="
    echo -e "${NC}"
    
    send_notification "SUCCESS" "✅ OpenRMM deployed successfully to $ENV"
}

# Run main function
main
