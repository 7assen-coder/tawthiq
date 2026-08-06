#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-}"
if [[ -z "$SRC" || ! -f "$SRC" ]]; then
  echo "Usage: $0 /path/to/access.json" >&2
  exit 1
fi

cp "$SRC" "$ROOT/access.json"
cd "$ROOT"

if [[ -n "$(git status --porcelain access.json)" ]]; then
  git add access.json
  git commit -m "$(cat <<'EOF'
Update access policy for hospital installs.

EOF
)"
  git push origin HEAD
  echo "Pushed access.json to origin."
else
  echo "access.json unchanged."
fi
