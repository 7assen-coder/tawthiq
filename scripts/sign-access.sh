#!/usr/bin/env bash
# Sign access.json with the publisher Ed25519 key (never commit the private key).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${TAWTHIQ_ACCESS_SIGNING_KEY:-$HOME/.config/tawthiq/access-signing.key}"
TARGET="${1:-$ROOT/access.json}"

if [[ ! -f "$KEY" ]]; then
  echo "Missing signing key at $KEY" >&2
  echo "Generate once: openssl genpkey -algorithm Ed25519 -out ~/.config/tawthiq/access-signing.key" >&2
  exit 1
fi
if [[ ! -f "$TARGET" ]]; then
  echo "Missing $TARGET" >&2
  exit 1
fi

SIG_BIN="$(mktemp)"
trap 'rm -f "$SIG_BIN"' EXIT
openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$TARGET" -out "$SIG_BIN"
base64 < "$SIG_BIN" | tr -d '\n' > "${TARGET}.sig"
echo "Wrote ${TARGET}.sig"
