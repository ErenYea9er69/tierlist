import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = neon(process.env.DATABASE_URL);
  const { key } = req.query;

  try {
    // Ensure table exists
    await sql`CREATE TABLE IF NOT EXISTS kv_store (key VARCHAR(255) PRIMARY KEY, value JSONB NOT NULL)`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
      if (rows.length > 0) {
        res.json({ value: JSON.stringify(rows[0].value) });
      } else {
        res.json({ value: null });
      }
    } else if (req.method === 'POST') {
      const { value } = req.body;
      const jsonValue = typeof value === 'string' ? JSON.parse(value) : value;
      await sql`
        INSERT INTO kv_store (key, value)
        VALUES (${key}, ${JSON.stringify(jsonValue)}::jsonb)
        ON CONFLICT (key)
        DO UPDATE SET value = ${JSON.stringify(jsonValue)}::jsonb
      `;
      res.json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ error: err.message });
  }
}
