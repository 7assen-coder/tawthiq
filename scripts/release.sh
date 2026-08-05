#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-}"
if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 1.0.1" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash first." >&2
  exit 1
fi

python3 - <<PY
import json, pathlib, re
root = pathlib.Path("$ROOT")
version = "$VERSION"

pkg = json.loads((root / "package.json").read_text())
pkg["version"] = version
(root / "package.json").write_text(json.dumps(pkg, indent=2) + "\n")

cargo = (root / "src-tauri" / "Cargo.toml").read_text()
cargo = re.sub(r'(?m)^version = ".*"$', f'version = "{version}"', cargo, count=1)
(root / "src-tauri" / "Cargo.toml").write_text(cargo)

conf = (root / "src-tauri" / "tauri.conf.json").read_text()
conf = re.sub(r'"version":\s*"[^"]+"', f'"version": "{version}"', conf, count=1)
(root / "src-tauri" / "tauri.conf.json").write_text(conf)
PY

git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: release v${VERSION}"
git tag "v${VERSION}"
git push origin HEAD
git push origin "v${VERSION}"
echo "Tagged and pushed v${VERSION}. GitHub Actions will build installers."
