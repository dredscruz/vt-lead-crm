import { getPool, ensureSchema, getSessionUser } from '../lib/db.js';

export default async function handler(req, res) {
  await ensureSchema();
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });

  try {
    if (req.method === 'GET') {
      // Return all leads + a revision counter
      const r = await getPool().query('SELECT id, data FROM leads ORDER BY id');
      return res.json({ leads: r.rows.map(x => x.data), rev: r.rows.length });
    }

    if (req.method === 'PUT') {
      // Full-state sync: client sends the complete lead array
      const { leads } = req.body || {};
      if (!Array.isArray(leads)) return res.status(400).json({ error: 'leads array required' });
      const db = getPool();
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM leads');
        for (const l of leads) {
          await client.query(
            `INSERT INTO leads (id,data,updated_at) VALUES ($1,$2,now())
             ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=now()`,
            [l.id, JSON.stringify(l)]);
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
