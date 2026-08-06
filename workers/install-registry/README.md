# Install registry (Cloudflare Worker)

Free Cloudflare Worker + KV that records heartbeats when any Tawthiq client opens online once.

- URL: `https://tawthiq-install-registry.tawthiq.workers.dev`
- `POST /v1/heartbeat` — `{ install_id, platform, hostname, app_version }`
- `GET /v1/seen` — admin only (`X-Install-Id` must be in `access.json` `admin_install_ids`)

## Deploy

```bash
cd workers/install-registry
npm install --legacy-peer-deps
npx wrangler login   # once
npx wrangler deploy
```

KV namespace IDs are in `wrangler.toml`. Do not put private keys here.
