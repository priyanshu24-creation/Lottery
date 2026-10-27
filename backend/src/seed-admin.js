import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in backend/.env');
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET to a random string at least 32 characters long.');
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admins (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, is_active=TRUE, updated_at=NOW()`,
    [email, hash]
  );
  console.log(`Admin account ready: ${email}`);
} finally {
  await pool.end();
}
