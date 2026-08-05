# Installer drop folder

After a GitHub Release finishes, run:

```bash
./scripts/fetch-installers.sh v1.0.0
```

That downloads assets here **and** copies them to `~/Desktop/Tawthiq/{windows,macos,linux}`.

Typical files:

- Windows: `Tawthiq_x.y.z_x64-setup.exe` (NSIS, per-user, silent `/S`)
- macOS: `.dmg` and/or `Tawthiq.app`
- Linux: `.deb` and `.AppImage`
- `SHA256SUMS.txt` / updater `latest.json` (updates, not first install)

See [docs/IT.md](../docs/IT.md).
