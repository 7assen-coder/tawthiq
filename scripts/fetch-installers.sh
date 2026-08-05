#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-v1.0.0}"
OUT="$ROOT/release"
mkdir -p "$OUT"

REPO="${GITHUB_REPOSITORY:-}"
if [[ -z "$REPO" ]]; then
  if git -C "$ROOT" remote get-url origin >/dev/null 2>&1; then
    REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
  else
    REPO="7assen-coder/tawthiq"
  fi
fi

echo "Downloading $TAG installers from $REPO …"
gh release download "$TAG" --repo "$REPO" --dir "$OUT" --clobber || true

ZIP_NAME="Tawthiq-${TAG}-all-os.zip"
if [[ -f "$OUT/$ZIP_NAME" ]]; then
  echo "Saved $OUT/$ZIP_NAME"
else
  echo "all-os zip not published yet — individual assets (if any) are in $OUT"
fi
ls -lh "$OUT" | sed -n '1,40p'

"$ROOT/scripts/stage-desktop-installers.sh" "$TAG"
