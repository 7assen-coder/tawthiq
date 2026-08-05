#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

git push -u origin main
git push origin v1.0.0 --force

if [[ -f tauri-updater.key ]]; then
  gh secret set TAURI_SIGNING_PRIVATE_KEY --repo 7assen-coder/tawthiq < tauri-updater.key
  printf '' | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo 7assen-coder/tawthiq
fi

echo "Pushed main + v1.0.0"
git ls-remote origin
gh run list --repo 7assen-coder/tawthiq --limit 8
