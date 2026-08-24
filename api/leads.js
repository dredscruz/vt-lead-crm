import { getPool, ensureSchema, getSessionUser } from '../lib/db.js';

export default async function handler(req, res) {
  await ensureSchema();
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });

  try {
    const db = getPool();

    if (req.method === 'GET') {
      // One-time migration: rows saved before per-user scoping belong to
      // whichever user opens the app first after this deploy.
      await db.query('UPDATE leads SET user_id=$1 WHERE user_id IS NULL', [user.id]);

      const r = await db.query(
        'SELECT data FROM leads WHERE user_id=$1 ORDER BY id', [user.id]);
      const s = await db.query(
        `SELECT value FROM meta WHERE key=$1`, [`settings:${user.id}`]);
      return res.json({
        leads: r.rows.map(x => x.data),
        rev: r.rows.length,
        settings: s.rows[0]?.value || null,
      });
    }

    if (req.method === 'PUT') {
      // Full-state sync for THIS user only: complete lead array + settings blob
      const { leads, settings } = req.body || {};
      if (!Array.isArray(leads)) return res.status(400).json({ error: 'leads array required' });
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM leads WHERE user_id=$1', [user.id]);
        for (const l of leads) {
          await client.query(
            `INSERT INTO leads (id,data,user_id,updated_at) VALUES ($1,$2,$3,now())
             ON CONFLICT (id) DO UPDATE SET data=$2, user_id=$3, updated_at=now()`,
            [l.id, JSON.stringify(l), user.id]);
        }
        if (settings && typeof settings === 'object') {
          await client.query(
            `INSERT INTO meta (key,value) VALUES ($1,$2)
             ON CONFLICT (key) DO UPDATE SET value=$2`,
            [`settings:${user.id}`, JSON.stringify(settings)]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      return res.json({ ok: true, count: leads.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}
