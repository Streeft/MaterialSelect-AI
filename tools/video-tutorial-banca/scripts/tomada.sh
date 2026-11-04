#!/usr/bin/env bash
# One take from a clean slate: rebuild the LOCAL recording DB, restart the app,
# prepare the scene data, then record. Extra arguments go to gravar.js
# (e.g. --seco, --cenas 2.3,2.5). Usage: scripts/tomada.sh --saida tmp/gravacao [...]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="${VENV:-/tmp/claude-0/venv-api}"
"$HERE/subir-app.sh" --reset
sleep 3
for i in 1 2 3 4 5; do "$VENV/bin/python" "$HERE/preparar_dados.py" && break; sleep 3; done
cd "$HERE/.."
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node scripts/gravar.js "$@"
