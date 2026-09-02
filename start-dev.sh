#!/usr/bin/env bash
set -e

echo "Starting Home Inventory Development Environment..."

if [ ! -f "apps/api/.env" ]; then
    echo "Creating apps/api/.env from template..."
    echo "ENVIRONMENT=development" > apps/api/.env
    echo "DATABASE_URL=sqlite+aiosqlite:///./home_inventory.db" >> apps/api/.env
    # SECRET_KEY stays empty for local dev; production must set its own (see apps/api/.env.example).
fi

echo "Installing dependencies..."
python3 -m pip install -r apps/api/requirements-dev.txt
npm --prefix apps/web install

export PYTHONPATH=apps/api

echo "Starting API at http://localhost:8000 ..."
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
API_PID=$!
trap 'kill "$API_PID"' EXIT INT TERM

echo "API Docs available at http://localhost:8000/docs"
echo "Starting web app at http://localhost:5173 ..."
npm --prefix apps/web run dev -- --host 127.0.0.1
