#!/usr/bin/env bash
# Levanta backend + frontend + ngrok y muestra el link público.

ROOT="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}⚽  Quiniela Mundial 2026 — Compartir${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Verificar ngrok ────────────────────────────────────────────────────────────
export PATH="$HOME/.local/bin:$PATH"
if ! command -v ngrok &> /dev/null; then
  echo -e "${RED}✗ ngrok no encontrado.${NC}"
  exit 1
fi

# ── Backend ───────────────────────────────────────────────────────────────────
if lsof -Pi :3000 -sTCP:LISTEN -t &>/dev/null; then
  echo -e "${YELLOW}⚡ Backend ya corriendo en :3000${NC}"
  BACKEND_PID=""
else
  echo -e "${YELLOW}▶  Levantando backend  (puerto 3000)...${NC}"
  (cd "$ROOT/backend" && npm run dev) > /tmp/quiniela-backend.log 2>&1 &
  BACKEND_PID=$!
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
if lsof -Pi :5173 -sTCP:LISTEN -t &>/dev/null; then
  echo -e "${YELLOW}⚡ Frontend ya corriendo en :5173${NC}"
  FRONTEND_PID=""
else
  echo -e "${YELLOW}▶  Levantando frontend (puerto 5173)...${NC}"
  (cd "$ROOT/frontend" && npm run dev) > /tmp/quiniela-frontend.log 2>&1 &
  FRONTEND_PID=$!

  echo -n "   Esperando que compile"
  for i in $(seq 1 20); do
    sleep 1; echo -n "."
    if curl -s http://localhost:5173 &>/dev/null; then echo " ✓"; break; fi
  done
fi

# ── ngrok ─────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}▶  Iniciando ngrok...${NC}"
ngrok http 5173 --log=stdout > /tmp/quiniela-ngrok.log 2>&1 &
NGROK_PID=$!

echo -n "   Obteniendo URL pública"
URL=""
for i in $(seq 1 15); do
  sleep 1; echo -n "."
  URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | python3 -c "
import json, sys
try:
    ts = json.load(sys.stdin).get('tunnels', [])
    https = [t for t in ts if t.get('proto') == 'https']
    print(https[0]['public_url']) if https else print('')
except:
    print('')
" 2>/dev/null)
  [ -n "$URL" ] && echo " ✓" && break
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$URL" ]; then
  echo -e "  ${GREEN}✅  ¡Todo listo! Mandá este link:${NC}"
  echo ""
  echo -e "     ${GREEN}🔗  $URL${NC}"
  echo ""
  echo "  El link funciona mientras esta terminal esté abierta."
else
  echo -e "  ${RED}⚠️  No se pudo obtener el link automáticamente.${NC}"
  echo "     Abrí  http://localhost:4040  en el navegador para verlo."
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Presioná Ctrl+C para apagar todo."
echo ""

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "🛑  Cerrando todo..."
  [ -n "$BACKEND_PID"  ] && kill "$BACKEND_PID"  2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  [ -n "$NGROK_PID"    ] && kill "$NGROK_PID"    2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

wait
