#!/bin/bash

# AutoStack - Stop Script
# Stops all AutoStack services

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Stopping AutoStack                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Stop services
docker-compose down

echo ""
echo "✓ AutoStack services stopped"
echo ""
echo "To start again, run: ./start-autostack.sh"
echo ""
