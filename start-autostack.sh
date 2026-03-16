#!/bin/bash

# AutoStack - Start Script
# Starts the complete AutoStack platform using Docker Compose

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    AutoStack Platform                          ║"
echo "║              Starting with Docker Compose                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "   Please start Docker and try again"
    exit 1
fi

# Check if .env.docker exists
if [ ! -f .env.docker ]; then
    echo "❌ Error: .env.docker file not found"
    echo "   Please create .env.docker with your Supabase credentials"
    exit 1
fi

echo "▶ Checking environment configuration..."
if grep -q "VITE_SUPABASE_URL=https://prrmrukwmrjkdxcyzovd.supabase.co" .env.docker; then
    echo "  ✓ Supabase URL configured"
else
    echo "  ⚠ Warning: Supabase URL may not be configured"
fi

echo ""
echo "▶ Building and starting services..."
echo ""

# Build and start services
docker-compose up --build -d

echo ""
echo "▶ Waiting for services to be healthy..."
sleep 5

# Check service status
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                   ✓ AutoStack is Running!                     ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Services:"
    echo "  🌐 Frontend:  http://localhost:3000"
    echo "  📊 Backend:   Supabase (https://prrmrukwmrjkdxcyzovd.supabase.co)"
    echo ""
    echo "Commands:"
    echo "  View logs:    docker-compose logs -f"
    echo "  Stop:         docker-compose down"
    echo "  Restart:      docker-compose restart"
    echo ""
    echo "Ready to deploy applications! 🚀"
    echo ""
else
    echo ""
    echo "❌ Error: Services failed to start"
    echo "   Run 'docker-compose logs' to see what went wrong"
    exit 1
fi
