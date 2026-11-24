#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  OZEK Lamp Studio - Arrancando entorno 3D"
echo "============================================"

if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias por primera vez..."
  npm install
fi

(sleep 2 && (open "http://localhost:5173" 2>/dev/null || xdg-open "http://localhost:5173" 2>/dev/null || true)) &
npm run dev -- --port 5173
