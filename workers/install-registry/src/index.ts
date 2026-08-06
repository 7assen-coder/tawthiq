/**
 * Tawthiq install registry — free Cloudflare Worker + KV.
 * POST /v1/heartbeat  — any client online once
 * GET  /v1/seen       — admin install IDs only (checked against access.json)
 */

export interface Env {
  SEEN: KVNamespace;
  ACCESS_URL: string;
}

interface HeartbeatBody {
  install_id?: string;
  platform?: string;
  hostname?: string;
  app_version?: string;
}

interface SeenRecord {
  id: string;
  label: string;
  platform: string;
  hostname: string;
  app_version: string;
  notes: string;
  first_seen: string;
  last_seen: string;
}

interface AccessPolicy {
  admin_install_ids?: string[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function kvKey(id: string): string {
  return `seen:${normalizeId(id)}`;
}

function rateKey(ip: string, id: string): string {
  return `rate:${ip}:${normalizeId(id)}`;
}

async function rateLimited(env: Env, ip: string, id: string): Promise<boolean> {
  const key = rateKey(ip, id);
  const raw = await env.SEEN.get(key);
  const now = Date.now();
  let count = 0;
  let windowStart = now;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { c: number; t: number };
      if (now - parsed.t < RATE_WINDOW_MS) {
        count = parsed.c;
        windowStart = parsed.t;
      }
    } catch {
      /* reset */
    }
  }
  if (count >= RATE_MAX) return true;
  await env.SEEN.put(
    key,
    JSON.stringify({ c: count + 1, t: windowStart }),
    { expirationTtl: 120 }
  );
  return false;
}

async function loadAdminIds(env: Env): Promise<Set<string>> {
  const cacheKey = "cache:admin_ids";
  const cached = await env.SEEN.get(cacheKey);
  if (cached) {
    try {
      const ids = JSON.parse(cached) as string[];
      return new Set(ids.map(normalizeId));
    } catch {
      /* fall through */
    }
  }
  const resp = await fetch(env.ACCESS_URL, {
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!resp.ok) return new Set();
  const policy = (await resp.json()) as AccessPolicy;
  const ids = (policy.admin_install_ids ?? []).map(normalizeId).filter(Boolean);
  await env.SEEN.put(cacheKey, JSON.stringify(ids), { expirationTtl: 120 });
  return new Set(ids);
}

async function handleHeartbeat(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  let body: HeartbeatBody;
  try {
    body = (await req.json()) as HeartbeatBody;
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const id = (body.install_id || "").trim();
  if (!UUID_RE.test(id)) return json({ error: "bad_id" }, 400);
  if (await rateLimited(env, ip, id)) return json({ error: "rate" }, 429);

  const now = new Date().toISOString();
  const existingRaw = await env.SEEN.get(kvKey(id));
  let firstSeen = now;
  let label = "";
  let notes = "";
  if (existingRaw) {
    try {
      const prev = JSON.parse(existingRaw) as SeenRecord;
      firstSeen = prev.first_seen || now;
      label = prev.label || "";
      notes = prev.notes || "";
    } catch {
      /* ignore */
    }
  }

  const platform = (body.platform || "unknown").slice(0, 32);
  const hostname = (body.hostname || "").slice(0, 128);
  const appVersion = (body.app_version || "").slice(0, 32);
  const record: SeenRecord = {
    id,
    label: label || hostname || "",
    platform,
    hostname,
    app_version: appVersion,
    notes,
    first_seen: firstSeen,
    last_seen: now,
  };
  await env.SEEN.put(kvKey(id), JSON.stringify(record));
  return json({ ok: true });
}

async function handleSeen(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") return json({ error: "method" }, 405);
  const caller = (req.headers.get("X-Install-Id") || "").trim();
  if (!UUID_RE.test(caller)) return json({ error: "unauthorized" }, 401);
  const admins = await loadAdminIds(env);
  if (!admins.has(normalizeId(caller))) {
    return json({ error: "forbidden" }, 403);
  }

  const listed = await env.SEEN.list({ prefix: "seen:" });
  const out: SeenRecord[] = [];
  for (const key of listed.keys) {
    const raw = await env.SEEN.get(key.name);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as SeenRecord);
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));
  return json({ installs: out });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/v1/heartbeat") return await handleHeartbeat(req, env);
      if (url.pathname === "/v1/seen") return await handleSeen(req, env);
      if (url.pathname === "/health") return json({ ok: true });
      return json({ error: "not_found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "internal" }, 500);
    }
  },
};
