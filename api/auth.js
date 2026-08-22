import crypto from 'crypto';
import { getPool, ensureSchema, getSessionUser } from '../lib/db.js';

export default async function handler(req, res) {
  await ensureSchema();
  const { action } = req.query;
  const b = req.body || {};

  const hash = (pw, salt) => crypto.createHash('sha256').update(salt + '::' + pw).digest('hex');

  try {
    // ---------- SIGNUP ----------
    if (action === 'signup') {
      const { name, email, recovery, password } = b;
      if (!name || !email || !password || password.length < 6)
        return res.status(400).json({ error: 'Name, email and a 6+ char password are required.' });
      const exists = await getPool().query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [email]);
      if (exists.rowCount) return res.status(409).json({ error: 'An account with this email already exists.' });
      const salt = crypto.randomUUID();
      const r = await getPool().query(
        `INSERT INTO users (name,email,recovery_email,salt,pass_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email`,
        [name, email.toLowerCase(), recovery || null, salt, hash(password, salt)]);
      return setSession(res, r.rows[0]);
    }

    // ---------- LOGIN ----------
    if (action === 'login') {
      const { email, password } = b;
      const r = await getPool().query('SELECT * FROM users WHERE lower(email)=lower($1)', [email || '']);
      const u = r.rows[0];
      if (!u) return res.status(401).json({ error: 'No account found with that email.' });
      if (hash(password || '', u.salt) !== u.pass_hash)
        return res.status(401).json({ error: 'Incorrect password. Try "Forgot password?".' });
      return setSession(res, { id: u.id, name: u.name, email: u.email });
    }

    // ---------- RECOVER ----------
    if (action === 'recover') {
      const { email, recovery, password } = b;
      if (!password || password.length < 6) return res.status(400).json({ error: 'New password must be 6+ characters.' });
      const r = await getPool().query('SELECT * FROM users WHERE lower(email)=lower($1)', [email || '']);
      const u = r.rows[0];
      if (!u) return res.status(404).json({ error: 'No account found with that email.' });
      if (u.recovery_email && (recovery || '').toLowerCase() !== u.recovery_email.toLowerCase())
        return res.status(403).json({ error: 'Recovery email does not match our records.' });
      const salt = crypto.randomUUID();
      await getPool().query('UPDATE users SET salt=$1, pass_hash=$2 WHERE id=$3', [salt, hash(password, salt), u.id]);
      return res.json({ ok: true });
    }

    // ---------- ME ----------
    if (action === 'me') {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: 'Not signed in' });
      return res.json({ user });
    }

    // ---------- LOGOUT ----------
    if (action === 'logout') {
      const cookie = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('vt_session='));
      if (cookie) await getPool().query('DELETE FROM sessions WHERE token=$1', [cookie.split('=')[1]]);
      res.setHeader('Set-Cookie', 'vt_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}


async function setSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const pool = getPool();
  await pool.query(`INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2, now() + interval '30 days')`, [token, user.id]);
  res.setHeader('Set-Cookie', `vt_session=${token}; Path=/; HttpOnly; Max-Age=${30*24*3600}; SameSite=Lax`);
  res.json({ user: { name: user.name, email: user.email } });
}
