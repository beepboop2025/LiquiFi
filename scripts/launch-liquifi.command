#!/usr/bin/env bash
# LiquiFi — double-click to launch (macOS .command file)
# Starts the Python backend + Vite dev server, opens the browser.

set -euo pipefail
cd "$(dirname "$0")/.."

BACKEND_PID=""
VITE_PID=""

cleanup() {
  echo ""
  echo "Shutting down LiquiFi..."
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  wait 2>/dev/null
  echo "Goodbye."
}
trap cleanup SIGINT SIGTERM EXIT

# --- Start backend ---
echo "Starting Python backend..."
if [ -f backend/venv/bin/python ]; then
  backend/venv/bin/python backend/main.py &
else
  python3 backend/main.py &
fi
BACKEND_PID=$!

# --- Wait for backend health ---
echo "Waiting for backend to be ready..."
TIMEOUT=30
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
    echo "Backend is ready."
    break
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done
if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "Warning: Backend did not respond within ${TIMEOUT}s — continuing anyway."
fi

# --- Start Vite dev server ---
echo "Starting Vite dev server..."
npx vite &
VITE_PID=$!

# --- Wait for Vite and open browser ---
sleep 3
echo "Opening browser..."
open http://localhost:5173

echo ""
echo "LiquiFi is running!"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  Press Ctrl+C to stop."
echo ""

# Keep alive until killed
wait
