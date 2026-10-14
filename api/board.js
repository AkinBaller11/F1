// Shared leaderboard for the Vercel deployment.
// Needs a Redis store connected to the project (Vercel Marketplace → Upstash Redis);
// it injects KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN).
// Without a store the endpoint answers 503 and the game keeps times on the device.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').trim().slice(0, n);
const keyOf = (track, style) => `apexgp25:board:${clean(track, 20).replace(/[^a-z0-9]/gi, '')}:${style === 'classic' ? 'classic' : 'modern'}`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'no_store' });
  try {
    if (req.method === 'GET') {
      const key = keyOf(req.query.track, req.query.style);
      const flat = await redis(['ZRANGE', key, '0', '49', 'WITHSCORES']);
      const meta = flat.length ? await redis(['HMGET', key + ':meta', ...flat.filter((_, i) => i % 2 === 0)]) : [];
      const rows = [];
      for (let i = 0; i < flat.length; i += 2) {
        let m = {}; try { m = JSON.parse(meta[i / 2] || '{}'); } catch (_) { /* ignore */ }
        rows.push({ name: flat[i].split('#')[0], time: +flat[i + 1], drv: m.drv || '', at: m.at || 0 });
      }
      return res.status(200).json({ rows });
    }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const time = +b.time, name = clean(b.name, 14) || 'Fahrer', id = clean(b.id, 40).replace(/[^a-z0-9-]/gi, '');
      if (!(time > 20 && time < 900) || !id) return res.status(400).json({ error: 'bad_request' });
      const key = keyOf(b.track, b.style), member = `${name}#${id}`;
      // one entry per device id: drop an old entry under a previous name, keep only the faster time
      const old = await redis(['HGET', key + ':ids', id]);
      if (old && old !== member) {
        const prev = await redis(['ZSCORE', key, old]);
        if (prev !== null && +prev < time) return res.status(200).json({ ok: true, kept: +prev });
        await redis(['ZREM', key, old]);
      }
      await redis(['ZADD', key, 'LT', String(time), member]);
      await redis(['HSET', key + ':ids', id, member]);
      await redis(['HSET', key + ':meta', member, JSON.stringify({ drv: clean(b.drv, 16), at: Date.now() })]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(502).json({ error: 'store_error' });
  }
}
