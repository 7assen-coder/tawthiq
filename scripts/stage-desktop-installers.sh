#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-v1.0.0}"
DESKTOP="${DESKTOP_DIR:-$HOME/Desktop/Tawthiq}"
RELEASE_DIR="$ROOT/release"

mkdir -p "$DESKTOP/windows" "$DESKTOP/macos" "$DESKTOP/linux"
shopt -s nullglob

write_os_readme() {
  local dir="$1"
  local os="$2"
  cat > "$dir/HOW_TO_INSTALL.txt" <<EOF
Tawthiq ${TAG} — ${os}
=======================

Windows:
  Double-click Tawthiq_*_x64-setup.exe
  No administrator account required.
  Silent install: Tawthiq_*_x64-setup.exe /S

macOS:
  Open the .dmg (or unzip) and drag Tawthiq.app to Applications.
  First launch: right-click Tawthiq → Open (Gatekeeper).

Linux:
  Debian / Ubuntu:  sudo dpkg -i Tawthiq_*.deb
  AppImage:         chmod +x Tawthiq_*.AppImage && ./Tawthiq_*.AppImage

Hospital SOP: see docs/IT.md in the source repo.
EOF
}

write_os_readme "$DESKTOP/windows" "Windows"
write_os_readme "$DESKTOP/macos" "macOS"
write_os_readme "$DESKTOP/linux" "Linux"

cat > "$DESKTOP/README.txt" <<EOF
Tawthiq ${TAG}
==============

This folder contains installers for each desktop OS:

  windows/   NSIS setup .exe  (normal Windows install)
  macos/     .dmg and/or Tawthiq.app
  linux/     .deb and .AppImage

Copy the matching folder to a USB stick for hospital PCs.
EOF

# Local macOS build artifacts
if [[ -d "$RELEASE_DIR/macos/Tawthiq.app" ]]; then
  rsync -a --delete "$RELEASE_DIR/macos/Tawthiq.app" "$DESKTOP/macos/"
fi
if [[ -d "$ROOT/src-tauri/target/release/bundle/macos/Tawthiq.app" ]]; then
  rsync -a --delete "$ROOT/src-tauri/target/release/bundle/macos/Tawthiq.app" "$DESKTOP/macos/"
fi
for f in "$ROOT/src-tauri/target/release/bundle/dmg/"*.dmg \
         "$ROOT/src-tauri/target/universal-apple-darwin/release/bundle/dmg/"*.dmg \
         "$RELEASE_DIR/"*.dmg; do
  cp -f "$f" "$DESKTOP/macos/"
done

# Unpacked GitHub all-os zip (if already downloaded)
for zip in "$RELEASE_DIR/Tawthiq-${TAG}-all-os.zip"; do
  if [[ -f "$zip" ]]; then
    TMP="$(mktemp -d)"
    unzip -qo "$zip" -d "$TMP"
    # zip may contain all-os/{windows,macos,linux} or flat files
    if [[ -d "$TMP/all-os" ]]; then
      cp -f "$TMP/all-os/windows/"* "$DESKTOP/windows/" 2>/dev/null || true
      cp -f "$TMP/all-os/macos/"* "$DESKTOP/macos/" 2>/dev/null || true
      cp -f "$TMP/all-os/linux/"* "$DESKTOP/linux/" 2>/dev/null || true
    else
      cp -f "$TMP/"*.exe "$DESKTOP/windows/" 2>/dev/null || true
      cp -f "$TMP/"*.dmg "$DESKTOP/macos/" 2>/dev/null || true
      cp -f "$TMP/"*.app.tar.gz "$DESKTOP/macos/" 2>/dev/null || true
      cp -f "$TMP/"*.deb "$DESKTOP/linux/" 2>/dev/null || true
      cp -f "$TMP/"*.AppImage "$DESKTOP/linux/" 2>/dev/null || true
    fi
    rm -rf "$TMP"
  fi
done

# Flat release downloads
for f in "$RELEASE_DIR/"*.exe; do cp -f "$f" "$DESKTOP/windows/"; done
for f in "$RELEASE_DIR/"*.dmg; do cp -f "$f" "$DESKTOP/macos/"; done
for f in "$RELEASE_DIR/"*.deb "$RELEASE_DIR/"*.AppImage; do
  [[ -f "$f" ]] && cp -f "$f" "$DESKTOP/linux/"
done

echo "Staged installers at: $DESKTOP"
echo
find "$DESKTOP" -type f | sort
