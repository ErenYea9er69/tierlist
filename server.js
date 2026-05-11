import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL
      );
    `);
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

initDB();

app.get('/api/db/:key', async (req, res) => {
  const { key } = req.params;
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
});

app.post('/api/db/:key', async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    // Parse it so we store it as proper JSONB, though value here comes in as string from saveDB
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
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
