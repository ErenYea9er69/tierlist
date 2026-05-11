import { Pool } from 'pg';

// We do not strictly need dotenv in Vercel production as Vercel injects it,
// but it's safe to import if available.

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Fire and forget table creation
pool.query(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL
  );
`).catch(console.error);

export default async function handler(req, res) {
  // CORS Headers for Vercel Serverless
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { key } = req.query;

  if (req.method === 'GET') {
    try {
      const result = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
      if (result.rows.length > 0) {
        res.json({ value: JSON.stringify(result.rows[0].value) });
      } else {
        res.json({ value: null });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'POST') {
    const { value } = req.body;
    try {
      const jsonValue = typeof value === 'string' ? JSON.parse(value) : value;
      await pool.query(`
        INSERT INTO kv_store (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value
      `, [key, jsonValue]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
