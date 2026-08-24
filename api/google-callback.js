import crypto from 'crypto';
import { getPool, ensureSchema } from '../lib/db.js';

export default async function handler(req, res) {
  await ensureSchema();
  const origin = process.env.SITE_URL || ('https://' + (req.headers.host || 'vt-lead-crm.vercel.app'));
  const appUrl = origin.replace(/\/$/, '') + '/';

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send('Google sign-in is not configured yet.');
    }

    // verify state cookie (CSRF protection)
    const cookies = Object.fromEntries(
      (req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(c => c[0])
    );
    const { code, state, error } = req.query;
    if (error) return res.redirect(302, appUrl + '#auth-error=' + encodeURIComponent('Google sign-in was cancelled.'));
    if (!code || !state || !cookies.vt_oauth_state || state !== cookies.vt_oauth_state) {
      return res.status(400).send('Sign-in could not be verified (bad state). Please try again.');
    }
    res.setHeader('Set-Cookie', 'vt_oauth_state=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');

    // exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: process.env.SITE_URL ? (process.env.SITE_URL.replace(/\/$/, '') + '/api/google-callback') : ('https://' + (req.headers.host || 'vt-lead-crm.vercel.app') + '/api/google-callback'),
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error('token exchange failed', tokens);
      return res.status(502).send('Google did not return a token. Check the OAuth client settings.');
    }

    // fetch profile
    const profRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
    });
    const prof = await profRes.json();
    if (!prof.email) return res.status(502).send('Could not read your Google account email.');

    // upsert local user (random unusable password for OAuth-only accounts)
    const salt = crypto.randomUUID();
    const randHash = crypto.createHash('sha256').update(salt + '::' + crypto.randomBytes(24).toString('hex')).digest('hex');
    let r = await getPool().query(
      `UPDATE users SET name=$1 WHERE lower(email)=lower($2) RETURNING id,name,email`,
      [prof.name || prof.email.split('@')[0], prof.email]);
    if (!r.rowCount) {
      r = await getPool().query(
        `INSERT INTO users (name,email,salt,pass_hash) VALUES ($1,$2,$3,$4) RETURNING id,name,email`,
        [prof.name || prof.email.split('@')[0], prof.email.toLowerCase(), salt, randHash]);
    }
    const user = r.rows[0];

    // create session (same as email login)
    const token = crypto.randomBytes(32).toString('hex');
    await getPool().query(
      `INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2, now() + interval '30 days')`,
      [token, user.id]);
    res.setHeader('Set-Cookie', `vt_session=${token}; Path=/; HttpOnly; Max-Age=${30*24*3600}; SameSite=Lax`);

    return res.redirect(302, appUrl);
  } catch (e) {
    console.error(e);
    return res.status(500).send('Google sign-in failed: ' + e.message);
  }
}
