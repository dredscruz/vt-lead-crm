import pg from 'pg';
const db = new pg.Pool({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await db.query('DELETE FROM leads');
await db.query('DELETE FROM sessions');
await db.query('DELETE FROM users');
const r = await db.query('SELECT (SELECT count(*) FROM leads) l, (SELECT count(*) FROM users) u, (SELECT count(*) FROM sessions) s');
console.log('remaining:', JSON.stringify(r.rows[0]));
await db.end();
