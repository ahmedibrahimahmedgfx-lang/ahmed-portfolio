/**
 * Cloudflare Worker in front of the static site.
 * It only runs for /api/* (see wrangler.jsonc); every other request is served straight from ./dist.
 *
 *   GET  /api/scores  -> { top: [{ name, ms, chips, secrets }], total }
 *   POST /api/scores  -> { ok, rank, total }   body: { name, ms, chips, secrets, email?, consent? }
 *
 * Storage: D1 database "cairo-scores" (binding DB). The table is created on first use.
 * Emails are optional, stored only with consent, and never returned by the API.
 */
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{1,15}$/u;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,180}\.[^\s@]{2,24}$/;
const MIN_MS = 45_000; // nobody walks the whole city faster than this
const MAX_MS = 6 * 60 * 60 * 1000;
const BLOCK = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'whore', 'slut', 'dick', 'pussy', 'porn', 'nazi', 'hitler', 'rape', 'http', 'www', '.com', 'كس', 'شرموط', 'خول', 'متناك', 'زب', 'عرص', 'لبوه', 'لبوة'];

let ready = false;
const ensure = async (db) => {
  if (ready) return;
  await db.batch([
    db.prepare(
      'CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ms INTEGER NOT NULL, chips INTEGER NOT NULL DEFAULT 0, secrets INTEGER NOT NULL DEFAULT 0, email TEXT, ip TEXT, at INTEGER NOT NULL)',
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS scores_ms ON scores (ms)'),
    db.prepare('CREATE INDEX IF NOT EXISTS scores_ip ON scores (ip, at)'),
  ]);
  ready = true;
};

const hashIp = async (ip) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cairo|' + ip));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const top = async (db) => {
  const rows = await db
    .prepare('SELECT name, MIN(ms) AS ms, MAX(chips) AS chips, MAX(secrets) AS secrets FROM scores GROUP BY name COLLATE NOCASE ORDER BY ms ASC LIMIT 20')
    .all();
  const total = await db.prepare('SELECT COUNT(DISTINCT name COLLATE NOCASE) AS n FROM scores').first();
  return { top: rows.results || [], total: (total && total.n) || 0 };
};

const int = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};

async function scores(request, env) {
  const db = env.DB;
  if (!db) return json({ error: 'offline' }, 503);
  await ensure(db);

  if (request.method === 'GET') return json(await top(db));
  if (request.method !== 'POST') return json({ error: 'method' }, 405);

  // same-site only
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'origin' }, 403);

  const text = await request.text();
  if (text.length > 1200) return json({ error: 'too_long' }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const name = String(body.name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const low = name.toLowerCase();
  if (!NAME_RE.test(name) || BLOCK.some((w) => low.includes(w))) return json({ error: 'name' }, 400);
  const ms = Math.round(Number(body.ms));
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) return json({ error: 'time' }, 400);
  const chips = int(body.chips, 0, 12);
  const secrets = int(body.secrets, 0, 3);
  const mail = String(body.email || '').trim().toLowerCase();
  const email = body.consent === true && EMAIL_RE.test(mail) ? mail : null;

  const now = Date.now();
  const ip = await hashIp(request.headers.get('cf-connecting-ip') || 'local');
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip = ? AND at > ?').bind(ip, now - 3600_000).first();
  if (recent && recent.n >= 5) return json({ error: 'slow_down' }, 429);
  const day = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE at > ?').bind(now - 86_400_000).first();
  if (day && day.n >= 800) return json({ error: 'slow_down' }, 429);

  await db.prepare('INSERT INTO scores (name, ms, chips, secrets, email, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(name, ms, chips, secrets, email, ip, now).run();
  const better = await db
    .prepare('SELECT COUNT(*) AS n FROM (SELECT MIN(ms) AS best FROM scores WHERE name <> ? COLLATE NOCASE GROUP BY name COLLATE NOCASE) WHERE best < ?')
    .bind(name, ms)
    .first();
  const board = await top(db);
  return json({ ok: true, rank: ((better && better.n) || 0) + 1, ...board });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/scores') {
      try {
        return await scores(request, env);
      } catch (err) {
        console.error('scores', err);
        return json({ error: 'server' }, 500);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
