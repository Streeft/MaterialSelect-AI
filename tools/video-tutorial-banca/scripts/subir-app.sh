#!/usr/bin/env bash
# Sobe a API e o frontend em modo produção, contra um banco SQLite LOCAL de gravação.
# Nunca aponta para produção. Uso: scripts/subir-app.sh [--reset]
#   --reset  recria o banco de gravação (migrações + seed + seed_extended) e troca o
#            nome do usuário da sessão fixa para "Participante" (só no banco local).
# Variáveis: VENV (python com apps/api instalado), REC (pasta de trabalho fora do repo).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VENV="${VENV:-/tmp/claude-0/venv-api}"
REC="${REC:-/tmp/claude-0/rec}"
PY="$VENV/bin/python"
API_PORT=8811
WEB_PORT=3011
mkdir -p "$REC"

export DATABASE_URL="sqlite:///$REC/gravacao.db"
export UPLOAD_DIR="$REC/uploads"
export CORS_ORIGINS="http://127.0.0.1:$WEB_PORT"
export AI_PROVIDER=mock
export ENVIRONMENT=development
# Token da sessão fixa (mesmo mecanismo da suíte E2E; vale só com ENVIRONMENT=development).
export E2E_SESSION_TOKEN="${E2E_SESSION_TOKEN:-video-banca-local-session-0001}"
export NOTEBOOK_EXTERNAL_SOURCES=false
export OPENALEX_API_KEY=
export WEB_SEARCH_PROVIDER=
export SESSION_COOKIE_SECURE=false

cd "$ROOT/apps/api"
if [[ "${1:-}" == "--reset" || ! -f "$REC/gravacao.db" ]]; then
  rm -f "$REC/gravacao.db"
  "$PY" -m alembic upgrade head
  "$PY" -m app.db.seed
  "$PY" -m app.db.seed_extended
  "$PY" - "$REC/gravacao.db" <<'EOF'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.execute("update user set name='Participante', email='participante@exemplo.invalid'")
c.commit()
EOF
fi

pkill -f "uvicorn app.main:app --host 127.0.0.1 --port $API_PORT" 2>/dev/null || true
while pgrep -f "uvicorn app.main:app --host 127.0.0.1 --port $API_PORT" >/dev/null; do sleep 0.5; done
# Quatro processos: com um só, a prévia do funil e a dos pesos enfileiram e o botão
# Executar fica desabilitado por mais de 20 s.
nohup "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port $API_PORT --workers 4 \
  > "$REC/api.log" 2>&1 &

cd "$ROOT/apps/web"
if [[ ! -f .next/BUILD_ID ]]; then
  NEXT_PUBLIC_API_URL="http://127.0.0.1:$API_PORT" npx next build --webpack > "$REC/build.log" 2>&1
fi
pkill -f "next start -p $WEB_PORT" 2>/dev/null || true
nohup npx next start -p $WEB_PORT -H 127.0.0.1 > "$REC/web.log" 2>&1 &

for url in "http://127.0.0.1:$API_PORT/api/health" "http://127.0.0.1:$WEB_PORT"; do
  for _ in $(seq 1 90); do curl -fs -o /dev/null "$url" && break; sleep 1; done
done
echo "API: http://127.0.0.1:$API_PORT  Web: http://127.0.0.1:$WEB_PORT"
