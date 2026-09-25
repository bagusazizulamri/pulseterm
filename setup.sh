#!/bin/bash
set -e

echo "=== Metrolist Reborn - Setup ==="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3.11+ is required"
    exit 1
fi

PYTHON_VER=$(python3 --version | cut -d' ' -f2)
echo "Python version: $PYTHON_VER"

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create necessary directories
mkdir -p cache uploads

# Initialize database
echo "Initializing database..."
python3 -c "
from backend.database import init_db
import asyncio
asyncio.run(init_db())
print('Database initialized successfully!')
"

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "To start the server:"
echo "  source venv/bin/activate"
echo "  python3 backend/main.py"
echo ""
echo "Then open: http://localhost:3000"
echo ""
echo "To change port, set APP_PORT env var:"
echo "  APP_PORT=5000 python3 backend/main.py"