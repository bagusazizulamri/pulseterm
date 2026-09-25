#!/bin/bash
# Metrolist Reborn - Persistent Runner
# Run this script and it will keep the server running

cd /home/b-ict/metrolist-reborn
source venv/bin/activate
export APP_PORT=3000
export APP_HOST=0.0.0.0

echo "Starting Metrolist Reborn on port 3000..."
echo "Access from Windows: http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000"
echo "Press Ctrl+C to stop."
echo ""

python3 backend/main.py