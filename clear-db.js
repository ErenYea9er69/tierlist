import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function clear() {
  await pool.query('DELETE FROM kv_store');
  console.log('Database cleared!');
  process.exit(0);
}
clear();
