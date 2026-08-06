<p align="center">
  <img src="docs/assets/logo.png" width="128" height="128" alt="Tawthiq logo" />
</p>

<h1 align="center">Tawthiq</h1>

<p align="center">
  <strong>Offline desktop app for CNAM ↔ OLIVEX hospital billing reconciliation</strong><br/>
  Mauritania · PIN only · Local SQLite · No cloud accounts
</p>

<p align="center">
  <a href="https://github.com/7assen-coder/tawthiq/actions/workflows/ci.yml"><img src="https://github.com/7assen-coder/tawthiq/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/7assen-coder/tawthiq/actions/workflows/release.yml"><img src="https://github.com/7assen-coder/tawthiq/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="https://github.com/7assen-coder/tawthiq/releases/latest"><img src="https://img.shields.io/github/v/release/7assen-coder/tawthiq?label=latest" alt="Latest release" /></a>
</p>

<p align="center">
  <img src="docs/assets/mark.svg" width="36" alt="" />
</p>

---

## Install

Download the installer for your PC from **[Releases](https://github.com/7assen-coder/tawthiq/releases/latest)** or from the `Tawthiq` folder on the Desktop after a local stage:

| OS | File | How to install |
| --- | --- | --- |
| **Windows 10 / 11** | `Tawthiq_*_x64-setup.exe` | Double-click. Per-user, **no admin**. Silent: `Tawthiq_…-setup.exe /S`. Installs WebView2 if missing. |
| **macOS 11+** | `Tawthiq_*.dmg` or `Tawthiq.app` | Open the DMG → drag to Applications. First launch: **right-click → Open** (Gatekeeper). |
| **Linux** | `.deb` or `.AppImage` | Debian/Ubuntu: `sudo dpkg -i Tawthiq_*.deb`. Or `chmod +x *.AppImage && ./Tawthiq_*.AppImage`. |

Hospital SOP (FR + AR), backup/restore, and kill-switch: **[docs/IT.md](docs/IT.md)**.

## What it does

- Import CNAM and OLIVEX Excel files (streamed, large files OK)
- Frozen comparison rules **Cas1–Cas7**
- PIN lock, idle lock, local-only SQLite (WAL) per OS user
- Share between PCs with **backup / restore** or Excel export — not a shared live database
- Signed in-app updates from GitHub Releases (`latest.json`)
- Remote revoke via signed public [`access.json`](access.json) (+ [`access.json.sig`](access.json.sig))
- Auto-listing of online installs for the Admin Machines tab (Cloudflare Worker registry)

## Stack

| Layer | Tech |
| --- | --- |
| UI | React 19 · Vite · Tailwind |
| Shell | Tauri 2 (Windows NSIS · macOS · Linux deb/AppImage) |
| Data | SQLite + rusqlite |
| Excel | calamine import · rust_xlsxwriter export |

## Develop

```bash
npm install
npm run tauri:dev
```

Requirements: Node 20+, Rust stable, platform WebView (WebView2 on Windows).

```bash
npx tsc -b
cd src-tauri && cargo test
```

## Version

Keep these in lockstep (currently **1.2.0**):

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Réglages → À propos shows the running version.

## Release

Public repo: [github.com/7assen-coder/tawthiq](https://github.com/7assen-coder/tawthiq).

```bash
# First publish (gh auth login first)
./scripts/setup-github.sh

# Later versions
./scripts/release.sh 1.0.1

# After Actions finishes: download all-OS zip + copy to Desktop/Tawthiq
./scripts/fetch-installers.sh v1.0.0
./scripts/stage-desktop-installers.sh v1.0.0
```

GitHub Actions:

- **CI** on `main` / PRs: `npm ci` · `tsc` · `cargo test` (Linux WebKit deps installed)
- **Release** on tag `v*`: Windows `.exe` · macOS `.dmg` · Linux `.deb` + `.AppImage` · updater `latest.json` · `Tawthiq-v…-all-os.zip`

Secrets:

- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (minisign; public key in `tauri.conf.json`)
- Optional Windows Authenticode / Azure Trusted Signing
- Optional macOS Developer ID: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

Access policy signing (Ed25519; never commit the private key):

```bash
# once
mkdir -p ~/.config/tawthiq
openssl genpkey -algorithm Ed25519 -out ~/.config/tawthiq/access-signing.key
./scripts/sign-access.sh
# after Admin export:
./scripts/admin-push-access.sh /path/to/access.json
```

Generate an updater keypair locally (never commit the private key):

```bash
npx tauri signer generate -w tauri-updater.key
```

Paste the printed public key into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

## Privacy

See [docs/PRIVACY.md](docs/PRIVACY.md). Enable full-disk encryption on hospital PCs. The database is plaintext SQLite in app data.

## License

See [LICENSE](LICENSE).
