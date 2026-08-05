#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO_NAME="${REPO_NAME:-tawthiq}"
OWNER="$(gh api user --jq .login)"
FULL="$OWNER/$REPO_NAME"
ORIGIN_URL="https://github.com/$FULL.git"

echo "GitHub user: $OWNER"

if gh repo view "$FULL" >/dev/null 2>&1; then
  echo "Repo $FULL already exists."
else
  gh repo create "$REPO_NAME" --public --description "Offline CNAM/OLIVEX hospital billing reconciliation desktop app"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$ORIGIN_URL"
else
  git remote add origin "$ORIGIN_URL"
fi

KEY_FILE="$ROOT/tauri-updater.key"
if [[ ! -f "$KEY_FILE" ]]; then
  echo "Missing $KEY_FILE — generate with: npx tauri signer generate -w tauri-updater.key" >&2
  exit 1
fi

gh secret set TAURI_SIGNING_PRIVATE_KEY --repo "$FULL" < "$KEY_FILE"
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo "$FULL" --body ""

git push -u origin main
if ! git rev-parse "v1.0.0" >/dev/null 2>&1; then
  git tag v1.0.0
fi
git push origin v1.0.0

echo "Pushed main + v1.0.0. Watch: https://github.com/$FULL/actions"
echo "When the Release job finishes, run: ./scripts/fetch-installers.sh v1.0.0"
