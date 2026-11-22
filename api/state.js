const { neon } = require('@neondatabase/serverless');
const crypto = require('node:crypto');

const COOKIE = 'adel_admin';
function sqlClient() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function sign(value) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('base64url');
}
function isAdmin(req) {
  const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw || !process.env.SESSION_SECRET) return false;
  const [expiry, signature] = raw.split('.');
  return Number(expiry) > Date.now() && safeEqual(signature || '', sign(expiry));
}
function cookie(value, maxAge) {
  return `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
async function ensure(sql) {
  await sql`CREATE TABLE IF NOT EXISTS adel_site_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS adel_login_attempts (ip text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, window_start timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS adel_rate_limits (ip text PRIMARY KEY, requests integer NOT NULL DEFAULT 0, window_start timestamptz NOT NULL DEFAULT now())`;
}
function json(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body)); }

module.exports = async (req, res) => {
  const sql = sqlClient();
  try {
    await ensure(sql);
    if (req.method === 'POST' && req.body?.action === 'login') {
      if (!process.env.ADMIN_PIN || !process.env.SESSION_SECRET) return json(res, 503, { error: 'Admin authentication is not configured' });
      const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim().slice(0, 64);
      const rows = await sql`INSERT INTO adel_login_attempts (ip) VALUES (${ip}) ON CONFLICT (ip) DO UPDATE SET attempts = CASE WHEN adel_login_attempts.window_start < now() - interval '15 minutes' THEN 1 ELSE adel_login_attempts.attempts + 1 END, window_start = CASE WHEN adel_login_attempts.window_start < now() - interval '15 minutes' THEN now() ELSE adel_login_attempts.window_start END RETURNING attempts`;
      if (rows[0].attempts > 8) return json(res, 429, { error: 'محاولات كثيرة، حاول بعد 15 دقيقة.' });
      if (!safeEqual(req.body.pin || '', process.env.ADMIN_PIN)) return json(res, 401, { error: 'رمز الدخول غير صحيح' });
      await sql`DELETE FROM adel_login_attempts WHERE ip = ${ip}`;
      const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
      res.setHeader('Set-Cookie', cookie(`${expiry}.${sign(expiry)}`, 8 * 60 * 60));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.body?.action === 'logout') {
      res.setHeader('Set-Cookie', cookie('', 0));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.body?.action === 'booking') {
      const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim().slice(0, 64);
      const attempts = await sql`INSERT INTO adel_rate_limits (ip) VALUES (${ip}) ON CONFLICT (ip) DO UPDATE SET requests = CASE WHEN adel_rate_limits.window_start < now() - interval '1 hour' THEN 1 ELSE adel_rate_limits.requests + 1 END, window_start = CASE WHEN adel_rate_limits.window_start < now() - interval '1 hour' THEN now() ELSE adel_rate_limits.window_start END RETURNING requests`;
      if (attempts[0].requests > 20) return json(res, 429, { error: 'طلبات كثيرة، حاول لاحقًا.' });
      const b = req.body.booking || {};
      for (const field of ['name', 'phone', 'type']) if (typeof b[field] !== 'string' || !b[field].trim() || b[field].length > 200) return json(res, 400, { error: 'بيانات الحجز غير مكتملة' });
      if (b.reason && b.reason.length > 2000) return json(res, 400, { error: 'الرسالة أطول من الحد المسموح' });
      const ref = `AR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const booking = { ...b, ref, ts: Date.now() };
      await sql`INSERT INTO adel_site_state (id, data) VALUES (1, jsonb_build_object('reqs', jsonb_build_array(${JSON.stringify(booking)}::jsonb), 'lastReq', 1)) ON CONFLICT (id) DO UPDATE SET data = jsonb_set(jsonb_set(adel_site_state.data, '{reqs}', COALESCE(adel_site_state.data->'reqs', '[]'::jsonb) || ${JSON.stringify(booking)}::jsonb), '{lastReq}', to_jsonb(COALESCE((adel_site_state.data->>'lastReq')::int, 0) + 1)), updated_at = now()`;
      return json(res, 201, { booking });
    }
    if (!isAdmin(req)) return json(res, 401, { error: 'يلزم تسجيل الدخول' });
    if (req.method === 'GET') {
      const rows = await sql`SELECT data FROM adel_site_state WHERE id = 1`;
      return json(res, 200, { data: rows[0]?.data || null });
    }
    if (req.method === 'PUT') {
      const data = req.body?.data;
      if (!data || !Array.isArray(data.appts) || !Array.isArray(data.meds) || !Array.isArray(data.reqs) || data.appts.length > 1000 || data.reqs.length > 1000) return json(res, 400, { error: 'بيانات لوحة المتابعة غير صالحة' });
      const safeData = { appts: data.appts, meds: data.meds, reqs: data.reqs, notes: String(data.notes || '').slice(0, 20000), tasks: Array.isArray(data.tasks) ? data.tasks.slice(0, 500) : [], lastReset: String(data.lastReset || ''), lastReq: Number(data.lastReq) || 0, wa: String(data.wa || '').slice(0, 20) };
      await sql`INSERT INTO adel_site_state (id, data) VALUES (1, ${JSON.stringify(safeData)}::jsonb) ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(safeData)}::jsonb, updated_at = now()`;
      return json(res, 200, { ok: true });
    }
    res.setHeader('Allow', 'GET, POST, PUT');
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('API request failed:', error.message);
    return json(res, 500, { error: 'تعذر حفظ البيانات حاليًا' });
  }
};
