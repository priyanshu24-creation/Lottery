import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err.message));
