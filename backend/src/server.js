import 'dotenv/config';
import bcrypt from 'bcryptjs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';
import { clearAuthCookie, clearUserCookie, requireAdmin, requireEditorOrAdmin, requireUser, signInCookie, signInUserCookie } from './security.js';
import { drawSchema, entrySchema, gameSchema, loginSchema, announcementSchema, lotterySchema, resultSchema, userRegistrationSchema } from './validation.js';
import { generateWinningNumbers, matchedCount, normalizeNumbers, numbersKey, prizeForMatches } from './game-engine.js';

const app = express();
const port = Number(process.env.PORT || 4000);
app.set('trust proxy', 1);
const allowedOrigins = new Set([
  ...(process.env.FRONTEND_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [])
]);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const entryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function auditOn(queryable, { adminId = null, userId = null } = {}, action, entityType, entityId, details = {}) {
  await queryable.query(
    'INSERT INTO audit_logs (admin_id, user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)',
    [adminId, userId, action, entityType, entityId || null, JSON.stringify(details)]
  );
}

async function audit(adminId, action, entityType, entityId, details = {}) {
  await auditOn(pool, { adminId }, action, entityType, entityId, details);
}

async function executeDraw(drawId, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const drawResult = await client.query(`
      SELECT d.*, g.name AS game_name, g.number_min, g.number_max, g.selection_count, g.prize_info
      FROM game_draws d JOIN games g ON g.id=d.game_id
      WHERE d.id=$1 FOR UPDATE
    `, [drawId]);
    const draw = drawResult.rows[0];
    if (!draw) throw Object.assign(new Error('Draw not found.'), { status: 404 });
    if (draw.status === 'drawn') throw Object.assign(new Error('This draw has already been completed.'), { status: 409 });
    const winningNumbers = generateWinningNumbers(draw);
    await client.query(
      `UPDATE game_draws SET status='drawn', winning_numbers=$1, drawn_at=NOW() WHERE id=$2`,
      [JSON.stringify(winningNumbers), drawId]
    );
    const entries = await client.query('SELECT * FROM game_entries WHERE draw_id=$1 FOR UPDATE', [drawId]);
    const winners = [];
    for (const entry of entries.rows) {
      const selectedNumbers = Array.isArray(entry.numbers) ? entry.numbers : JSON.parse(entry.numbers);
      const matches = matchedCount(selectedNumbers, winningNumbers);
      const prizePoints = prizeForMatches(draw.prize_info, matches);
      const status = prizePoints > 0 ? 'won' : 'lost';
      await client.query('UPDATE game_entries SET status=$1 WHERE id=$2', [status, entry.id]);
      if (prizePoints > 0) {
        const userResult = await client.query(
          'UPDATE users SET points_balance=points_balance+$1, updated_at=NOW() WHERE id=$2 RETURNING points_balance',
          [prizePoints, entry.user_id]
        );
        await client.query(
          `INSERT INTO winners (draw_id, entry_id, user_id, matched_count, prize_points) VALUES ($1,$2,$3,$4,$5)`,
          [drawId, entry.id, entry.user_id, matches, prizePoints]
        );
        await client.query(
          `INSERT INTO point_transactions (user_id, entry_id, amount, reason, balance_after) VALUES ($1,$2,$3,$4,$5)`,
          [entry.user_id, entry.id, prizePoints, `Prize for ${draw.game_name}`, userResult.rows[0].points_balance]
        );
        winners.push({ entry_id: entry.id, user_id: entry.user_id, matched_count: matches, prize_points: prizePoints });
      }
    }
    await auditOn(client, { adminId }, 'DRAW', 'game_draw', drawId, { winning_numbers: winningNumbers, winners: winners.length });
    await client.query('COMMIT');
    return { draw_id: drawId, winning_numbers: winningNumbers, winners };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

function requireCronSecret(req, res, next) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = req.get('authorization') || '';
  const suppliedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return res.status(configuredSecret ? 401 : 503).json({ error: 'Scheduled draw authorization is unavailable.' });
  }
  next();
}

app.get('/api/lotteries', asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, slug, description, draw_schedule FROM lotteries WHERE is_active = TRUE ORDER BY name'
  );
  res.json(rows);
}));

app.get('/api/results', asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const search = String(req.query.search || '').slice(0, 120);
  const params = [limit];
  let filter = '';
  if (search) {
    params.push(`%${search}%`);
    filter = `AND (l.name ILIKE $2 OR r.draw_label ILIKE $2 OR r.draw_date::text ILIKE $2)`;
  }
  const { rows } = await pool.query(`
    SELECT r.id, r.draw_date, r.draw_label, r.winning_numbers, r.prize_info,
           r.source_name, r.source_url, r.published_at,
           l.name AS lottery_name, l.slug AS lottery_slug
    FROM results r JOIN lotteries l ON l.id = r.lottery_id
    WHERE r.status = 'published' AND l.is_active = TRUE ${filter}
    ORDER BY r.draw_date DESC, r.published_at DESC NULLS LAST
    LIMIT $1
  `, params);
  res.json(rows);
}));

app.get('/api/results/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT r.id, r.draw_date, r.draw_label, r.winning_numbers, r.prize_info,
           r.source_name, r.source_url, r.published_at,
           l.name AS lottery_name, l.slug AS lottery_slug
    FROM results r JOIN lotteries l ON l.id = r.lottery_id
    WHERE r.id = $1 AND r.status = 'published' AND l.is_active = TRUE
  `, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Result not found.' });
  res.json(rows[0]);
}));

app.get('/api/games', asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT g.*, d.id AS next_draw_id, d.draw_at, d.entry_closes_at, d.status AS draw_status
    FROM games g
    LEFT JOIN LATERAL (
      SELECT id, draw_at, entry_closes_at, status FROM game_draws
      WHERE game_id=g.id AND status <> 'drawn' ORDER BY draw_at LIMIT 1
    ) d ON TRUE
    WHERE g.is_active=TRUE ORDER BY g.name
  `);
  res.json(rows);
}));

app.get('/api/games/:slug', asyncRoute(async (req, res) => {
  const gameResult = await pool.query('SELECT * FROM games WHERE slug=$1 AND is_active=TRUE', [req.params.slug]);
  if (!gameResult.rows[0]) return res.status(404).json({ error: 'Game not found.' });
  const game = gameResult.rows[0];
  const draws = await pool.query(`
    SELECT id, draw_at, entry_closes_at, status, winning_numbers, drawn_at
    FROM game_draws WHERE game_id=$1 ORDER BY draw_at DESC LIMIT 20
  `, [game.id]);
  res.json({ ...game, draws: draws.rows });
}));

app.get('/api/announcements', asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT id, title, body, published_at FROM announcements
    WHERE is_published=TRUE ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 20
  `);
  res.json(rows);
}));

app.post('/api/auth/register', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = userRegistrationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Enter a valid name, email, and password.' });
  const data = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(data.password, 12);
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email, points_balance`,
      [data.name, data.email.toLowerCase(), hash]
    );
    const user = userResult.rows[0];
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, reason, balance_after) VALUES ($1,$2,$3,$4)`,
      [user.id, 1000, 'Welcome points', user.points_balance]
    );
    await auditOn(client, { userId: user.id }, 'REGISTER', 'user', user.id, {});
    await client.query('COMMIT');
    signInUserCookie(res, user);
    res.status(201).json({ user });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.post('/api/auth/login', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const { rows } = await pool.query('SELECT id, name, email, password_hash, points_balance, is_active FROM users WHERE email=$1', [parsed.data.email.toLowerCase()]);
  const user = rows[0];
  if (!user || !user.is_active || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  signInUserCookie(res, user);
  await auditOn(pool, { userId: user.id }, 'LOGIN', 'user', user.id, {});
  res.json({ user: { id: user.id, name: user.name, email: user.email, points_balance: user.points_balance } });
}));

app.post('/api/auth/logout', requireUser, asyncRoute(async (req, res) => {
  clearUserCookie(res);
  await auditOn(pool, { userId: req.user.id }, 'LOGOUT', 'user', req.user.id, {});
  res.json({ ok: true });
}));

app.get('/api/auth/me', requireUser, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email, points_balance, created_at FROM users WHERE id=$1 AND is_active=TRUE', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Account unavailable.' });
  res.json({ user: rows[0] });
}));

app.get('/api/me/dashboard', requireUser, asyncRoute(async (req, res) => {
  const [userResult, entriesResult, transactionsResult] = await Promise.all([
    pool.query('SELECT id, name, email, points_balance, created_at FROM users WHERE id=$1 AND is_active=TRUE', [req.user.id]),
    pool.query(`SELECT e.id, e.numbers, e.points_cost, e.status, e.created_at, g.name AS game_name, g.slug,
      d.id AS draw_id, d.draw_at, d.status AS draw_status, d.winning_numbers,
      w.matched_count, w.prize_points
      FROM game_entries e JOIN games g ON g.id=e.game_id JOIN game_draws d ON d.id=e.draw_id
      LEFT JOIN winners w ON w.entry_id=e.id WHERE e.user_id=$1 ORDER BY e.created_at DESC LIMIT 100`, [req.user.id]),
    pool.query('SELECT id, amount, reason, balance_after, created_at FROM point_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id])
  ]);
  if (!userResult.rows[0]) return res.status(401).json({ error: 'Account unavailable.' });
  res.json({ user: userResult.rows[0], entries: entriesResult.rows, transactions: transactionsResult.rows });
}));

app.get('/api/me/entries', requireUser, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.id, e.numbers, e.points_cost, e.status, e.created_at, g.name AS game_name,
      d.draw_at, d.status AS draw_status, d.winning_numbers, w.matched_count, w.prize_points
    FROM game_entries e JOIN games g ON g.id=e.game_id JOIN game_draws d ON d.id=e.draw_id
    LEFT JOIN winners w ON w.entry_id=e.id WHERE e.user_id=$1 ORDER BY e.created_at DESC LIMIT 100
  `, [req.user.id]);
  res.json(rows);
}));

app.post('/api/games/:gameId/entries', requireUser, entryLimiter, asyncRoute(async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Select a draw and valid numbers.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const drawResult = await client.query(`
      SELECT d.*, g.name AS game_name, g.is_active, g.number_min, g.number_max, g.selection_count, g.entry_cost
      FROM game_draws d JOIN games g ON g.id=d.game_id WHERE d.id=$1 AND d.game_id=$2 FOR UPDATE
    `, [parsed.data.draw_id, req.params.gameId]);
    const draw = drawResult.rows[0];
    if (!draw || !draw.is_active) throw Object.assign(new Error('Game or draw not found.'), { status: 404 });
    if (draw.status === 'drawn' || new Date(draw.draw_at) <= new Date()) throw Object.assign(new Error('This draw has already started.'), { status: 409 });
    if (new Date(draw.entry_closes_at) <= new Date()) {
      await client.query("UPDATE game_draws SET status='closed' WHERE id=$1 AND status='open'", [draw.id]);
      throw Object.assign(new Error('Entries for this draw are closed.'), { status: 409 });
    }
    const numbers = normalizeNumbers(draw, parsed.data.numbers);
    const userResult = await client.query('SELECT id, points_balance FROM users WHERE id=$1 AND is_active=TRUE FOR UPDATE', [req.user.id]);
    const user = userResult.rows[0];
    if (!user) throw Object.assign(new Error('Account unavailable.'), { status: 401 });
    if (user.points_balance < draw.entry_cost) throw Object.assign(new Error('You do not have enough virtual points.'), { status: 400 });
    const key = numbersKey(numbers);
    const entryResult = await client.query(`
      INSERT INTO game_entries (user_id, game_id, draw_id, numbers, numbers_key, points_cost)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, numbers, points_cost, status, created_at
    `, [req.user.id, draw.game_id, draw.id, JSON.stringify(numbers), key, draw.entry_cost]);
    const balanceResult = await client.query(
      'UPDATE users SET points_balance=points_balance-$1, updated_at=NOW() WHERE id=$2 RETURNING points_balance',
      [draw.entry_cost, req.user.id]
    );
    await client.query(
      `INSERT INTO point_transactions (user_id, entry_id, amount, reason, balance_after) VALUES ($1,$2,$3,$4,$5)`,
      [req.user.id, entryResult.rows[0].id, -draw.entry_cost, `Entry for ${draw.game_name}`, balanceResult.rows[0].points_balance]
    );
    await auditOn(client, { userId: req.user.id }, 'CREATE', 'game_entry', entryResult.rows[0].id, { game_id: draw.game_id, draw_id: draw.id });
    await client.query('COMMIT');
    res.status(201).json({ entry: entryResult.rows[0], points_balance: balanceResult.rows[0].points_balance });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'You already submitted this number selection for the draw.' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  } finally {
    client.release();
  }
}));

app.post('/api/admin/login', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const email = parsed.data.email.toLowerCase();
  const { rows } = await pool.query(
    'SELECT id, email, password_hash, role, is_active FROM admins WHERE email = $1',
    [email]
  );
  const admin = rows[0];
  if (!admin || !admin.is_active || !(await bcrypt.compare(parsed.data.password, admin.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  signInCookie(res, admin);
  await audit(admin.id, 'LOGIN', 'admin', admin.id);
  res.json({ admin: { id: admin.id, email: admin.email, role: admin.role } });
}));

app.post('/api/admin/logout', requireAdmin, asyncRoute(async (req, res) => {
  clearAuthCookie(res);
  await audit(req.admin.id, 'LOGOUT', 'admin', req.admin.id);
  res.json({ ok: true });
}));

app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ admin: req.admin }));

app.get('/api/admin/overview', requireAdmin, asyncRoute(async (_req, res) => {
  const [lotteries, published, drafts, recent] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM lotteries'),
    pool.query("SELECT COUNT(*)::int AS count FROM results WHERE status = 'published'"),
    pool.query("SELECT COUNT(*)::int AS count FROM results WHERE status = 'draft'"),
    pool.query(`SELECT r.id, r.draw_date, r.draw_label, r.status, l.name AS lottery_name
      FROM results r JOIN lotteries l ON l.id=r.lottery_id ORDER BY r.updated_at DESC LIMIT 8`)
  ]);
  res.json({ lotteries: lotteries.rows[0].count, published: published.rows[0].count, drafts: drafts.rows[0].count, recent: recent.rows });
}));

app.get('/api/admin/lotteries', requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM lotteries ORDER BY created_at DESC');
  res.json(rows);
}));

app.post('/api/admin/lotteries', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const parsed = lotterySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid lottery data.' });
  const d = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO lotteries (name, slug, description, draw_schedule, is_active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [d.name, d.slug, d.description, d.draw_schedule, d.is_active]
  );
  await audit(req.admin.id, 'CREATE', 'lottery', rows[0].id, { name: d.name });
  res.status(201).json(rows[0]);
}));

app.put('/api/admin/lotteries/:id', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const parsed = lotterySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid lottery data.' });
  const d = parsed.data;
  const { rows } = await pool.query(
    `UPDATE lotteries SET name=$1, slug=$2, description=$3, draw_schedule=$4, is_active=$5, updated_at=NOW()
     WHERE id=$6 RETURNING *`,
    [d.name, d.slug, d.description, d.draw_schedule, d.is_active, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Lottery not found.' });
  await audit(req.admin.id, 'UPDATE', 'lottery', rows[0].id, { name: d.name });
  res.json(rows[0]);
}));

app.delete('/api/admin/lotteries/:id', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('UPDATE lotteries SET is_active=FALSE, updated_at=NOW() WHERE id=$1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Lottery not found.' });
  await audit(req.admin.id, 'DEACTIVATE', 'lottery', req.params.id);
  res.json({ ok: true });
}));

app.get('/api/admin/results', requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT r.*, l.name AS lottery_name FROM results r
    JOIN lotteries l ON l.id=r.lottery_id ORDER BY r.draw_date DESC, r.updated_at DESC
  `);
  res.json(rows);
}));

app.post('/api/admin/results', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid result data.' });
  const d = parsed.data;
  const publishedAt = d.status === 'published' ? new Date() : null;
  const { rows } = await pool.query(`
    INSERT INTO results (lottery_id, draw_date, draw_label, winning_numbers, prize_info, status,
      source_name, source_url, verification_notes, published_at, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *
  `, [d.lottery_id, d.draw_date, d.draw_label, JSON.stringify(d.winning_numbers), JSON.stringify(d.prize_info),
      d.status, d.source_name, d.source_url, d.verification_notes, publishedAt, req.admin.id]);
  await audit(req.admin.id, 'CREATE', 'result', rows[0].id, { status: d.status });
  res.status(201).json(rows[0]);
}));

app.put('/api/admin/results/:id', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid result data.' });
  const d = parsed.data;
  const { rows } = await pool.query(`
    UPDATE results SET lottery_id=$1, draw_date=$2, draw_label=$3, winning_numbers=$4, prize_info=$5,
      status=$6, source_name=$7, source_url=$8, verification_notes=$9,
      published_at=CASE WHEN $6='published' THEN COALESCE(published_at, NOW()) ELSE NULL END,
      updated_by=$10, updated_at=NOW()
    WHERE id=$11 RETURNING *
  `, [d.lottery_id, d.draw_date, d.draw_label, JSON.stringify(d.winning_numbers), JSON.stringify(d.prize_info),
      d.status, d.source_name, d.source_url, d.verification_notes, req.admin.id, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Result not found.' });
  await audit(req.admin.id, 'UPDATE', 'result', rows[0].id, { status: d.status });
  res.json(rows[0]);
}));

app.delete('/api/admin/results/:id', requireAdmin, asyncRoute(async (req, res) => {
  if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Only admins can delete results.' });
  const { rows } = await pool.query('DELETE FROM results WHERE id=$1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Result not found.' });
  await audit(req.admin.id, 'DELETE', 'result', req.params.id);
  res.json({ ok: true });
}));

app.get('/api/admin/audit-logs', requireAdmin, asyncRoute(async (req, res) => {
  if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Only admins can view audit logs.' });
  const { rows } = await pool.query(`
    SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
      ad.email AS admin_email, u.email AS user_email
    FROM audit_logs a LEFT JOIN admins ad ON ad.id=a.admin_id LEFT JOIN users u ON u.id=a.user_id
    ORDER BY a.created_at DESC LIMIT 100
  `);
  res.json(rows);
}));

app.get('/api/admin/games', requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT g.*, COUNT(DISTINCT e.id)::int AS entry_count, COUNT(DISTINCT d.id)::int AS draw_count
    FROM games g LEFT JOIN game_entries e ON e.game_id=g.id LEFT JOIN game_draws d ON d.game_id=g.id
    GROUP BY g.id ORDER BY g.created_at DESC
  `);
  res.json(rows);
}));

app.post('/api/admin/games', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const parsed = gameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid game data.' });
  const game = parsed.data;
  const { rows } = await pool.query(`
    INSERT INTO games (name, slug, description, rules, prize_info, number_min, number_max, selection_count, entry_cost, is_active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
  `, [game.name, game.slug, game.description, JSON.stringify(game.rules), JSON.stringify(game.prize_info), game.number_min, game.number_max, game.selection_count, game.entry_cost, game.is_active]);
  await audit(req.admin.id, 'CREATE', 'game', rows[0].id, { name: game.name });
  res.status(201).json(rows[0]);
}));

app.put('/api/admin/games/:id', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const parsed = gameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid game data.' });
  const game = parsed.data;
  const { rows } = await pool.query(`
    UPDATE games SET name=$1, slug=$2, description=$3, rules=$4, prize_info=$5, number_min=$6,
      number_max=$7, selection_count=$8, entry_cost=$9, is_active=$10, updated_at=NOW() WHERE id=$11 RETURNING *
  `, [game.name, game.slug, game.description, JSON.stringify(game.rules), JSON.stringify(game.prize_info), game.number_min, game.number_max, game.selection_count, game.entry_cost, game.is_active, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Game not found.' });
  await audit(req.admin.id, 'UPDATE', 'game', req.params.id, { name: game.name });
  res.json(rows[0]);
}));

app.delete('/api/admin/games/:id', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('UPDATE games SET is_active=FALSE, updated_at=NOW() WHERE id=$1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Game not found.' });
  await audit(req.admin.id, 'DEACTIVATE', 'game', req.params.id);
  res.json({ ok: true });
}));

app.get('/api/admin/draws', requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT d.*, g.name AS game_name, g.slug AS game_slug,
      (SELECT COUNT(*)::int FROM game_entries e WHERE e.draw_id=d.id) AS entry_count
    FROM game_draws d JOIN games g ON g.id=d.game_id ORDER BY d.draw_at DESC
  `);
  res.json(rows);
}));

app.post('/api/admin/draws', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const parsed = drawSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid draw schedule.' });
  const { game_id, draw_at, entry_closes_at } = parsed.data;
  const game = await pool.query('SELECT id, is_active FROM games WHERE id=$1', [game_id]);
  if (!game.rows[0] || !game.rows[0].is_active) return res.status(400).json({ error: 'Select an active game.' });
  const { rows } = await pool.query(
    `INSERT INTO game_draws (game_id, draw_at, entry_closes_at) VALUES ($1,$2,$3) RETURNING *`,
    [game_id, draw_at, entry_closes_at]
  );
  await audit(req.admin.id, 'CREATE', 'game_draw', rows[0].id, { game_id });
  res.status(201).json(rows[0]);
}));

app.post('/api/admin/draws/:id/close', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(`UPDATE game_draws SET status='closed' WHERE id=$1 AND status='open' RETURNING *`, [req.params.id]);
  if (!rows[0]) return res.status(409).json({ error: 'Draw is missing or is no longer open.' });
  await audit(req.admin.id, 'CLOSE', 'game_draw', req.params.id);
  res.json(rows[0]);
}));

app.post('/api/admin/draws/:id/run', requireAdmin, asyncRoute(async (req, res) => {
  if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Only admins can execute draws.' });
  const result = await executeDraw(req.params.id, req.admin.id);
  res.json(result);
}));

app.get('/api/admin/entries', requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT e.id, e.numbers, e.points_cost, e.status, e.created_at, u.name AS user_name, u.email AS user_email,
      g.name AS game_name, d.draw_at, d.status AS draw_status, w.matched_count, w.prize_points
    FROM game_entries e JOIN users u ON u.id=e.user_id JOIN games g ON g.id=e.game_id JOIN game_draws d ON d.id=e.draw_id
    LEFT JOIN winners w ON w.entry_id=e.id ORDER BY e.created_at DESC LIMIT 500
  `);
  res.json(rows);
}));

app.get('/api/admin/users', requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.name, u.email, u.points_balance, u.is_active, u.created_at,
      COUNT(e.id)::int AS entry_count FROM users u LEFT JOIN game_entries e ON e.user_id=u.id
    GROUP BY u.id ORDER BY u.created_at DESC
  `);
  res.json(rows);
}));

app.get('/api/admin/announcements', requireAdmin, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC');
  res.json(rows);
}));

app.post('/api/admin/announcements', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid announcement.' });
  const announcement = parsed.data;
  const { rows } = await pool.query(`
    INSERT INTO announcements (title, body, is_published, published_at, created_by)
    VALUES ($1,$2,$3,CASE WHEN $3 THEN NOW() ELSE NULL END,$4) RETURNING *
  `, [announcement.title, announcement.body, announcement.is_published, req.admin.id]);
  await audit(req.admin.id, 'CREATE', 'announcement', rows[0].id, { title: announcement.title });
  res.status(201).json(rows[0]);
}));

app.put('/api/admin/announcements/:id', requireAdmin, requireEditorOrAdmin, asyncRoute(async (req, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid announcement.' });
  const announcement = parsed.data;
  const { rows } = await pool.query(`
    UPDATE announcements SET title=$1, body=$2, is_published=$3,
      published_at=CASE WHEN $3 THEN COALESCE(published_at,NOW()) ELSE NULL END, updated_at=NOW()
    WHERE id=$4 RETURNING *
  `, [announcement.title, announcement.body, announcement.is_published, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Announcement not found.' });
  await audit(req.admin.id, 'UPDATE', 'announcement', req.params.id, { title: announcement.title });
  res.json(rows[0]);
}));

app.get('/api/cron/draws', requireCronSecret, asyncRoute(async (_req, res) => {
  const processed = await executeDueDraws();
  res.json({ ok: true, processed });
}));

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use((err, _req, res, _next) => {
  if (err.code === '23505') return res.status(409).json({ error: 'A record with these details already exists.' });
  if (err.code === '23503') return res.status(400).json({ error: 'The selected lottery is invalid or is in use.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

async function executeDueDraws() {
  const { rows } = await pool.query("SELECT id FROM game_draws WHERE status='open' AND draw_at <= NOW() ORDER BY draw_at LIMIT 20");
  let processed = 0;
  for (const draw of rows) {
    try { await executeDraw(draw.id, null); processed += 1; } catch (error) { console.error(`Unable to execute scheduled draw ${draw.id}:`, error.message); }
  }
  return processed;
}

const runningAsVercelFunction = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
if (!runningAsVercelFunction) {
  const scheduler = setInterval(() => executeDueDraws().catch((error) => console.error('Draw scheduler error:', error.message)), 60 * 1000);
  scheduler.unref?.();
  app.listen(port, () => console.log(`Dear Results Portal API listening on port ${port}`));
}

export default app;
