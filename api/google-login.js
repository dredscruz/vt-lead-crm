import crypto from 'crypto';
import { getPool, ensureSchema } from '../lib/db.js';

export default async function handler(req, res) {
  await ensureSchema();
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const origin = process.env.SITE_URL || ('https://' + (req.headers.host || 'vt-lead-crm.vercel.app'));
    if (!clientId) {
      return res.status(500).send('Google sign-in is not configured yet (missing GOOGLE_CLIENT_ID).');
    }

    const redirectUri = origin.replace(/\/$/, '') + '/api/google-callback';
    const state = crypto.randomBytes(16).toString('hex');

    res.setHeader('Set-Cookie', `vt_oauth_state=${state}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax`);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    return res.redirect(302, url.toString());
  } catch (e) {
    console.error(e);
    return res.status(500).send('Could not start Google sign-in.');
  }
}
