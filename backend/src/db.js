import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim();
const serverlessRuntime = Boolean(
  process.env.NETLIFY ||
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
);
const productionRuntime = process.env.NODE_ENV === 'production' || serverlessRuntime;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for the PostgreSQL connection.');
}

let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
}

if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.');
}

if (!parsedDatabaseUrl.hostname || !parsedDatabaseUrl.username) {
  throw new Error('DATABASE_URL must include a PostgreSQL host and username.');
}

const localDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1']);
const isLocalDatabase = localDatabaseHosts.has(parsedDatabaseUrl.hostname);

if (productionRuntime && isLocalDatabase) {
  throw new Error('DATABASE_URL must point to a hosted PostgreSQL database in production.');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
  max: serverlessRuntime ? 5 : 10,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: serverlessRuntime ? 10_000 : 30_000,
  keepAlive: true
});

pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err.message));
