CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lotteries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  draw_schedule TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lottery_id UUID NOT NULL REFERENCES lotteries(id) ON DELETE RESTRICT,
  draw_date DATE NOT NULL,
  draw_label TEXT NOT NULL DEFAULT '',
  winning_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  prize_info JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  source_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  verification_notes TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lottery_id, draw_date, draw_label)
);

CREATE INDEX IF NOT EXISTS idx_results_public_date ON results(status, draw_date DESC);
CREATE INDEX IF NOT EXISTS idx_results_lottery ON results(lottery_id, draw_date DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  points_balance INTEGER NOT NULL DEFAULT 1000 CHECK (points_balance >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  prize_info JSONB NOT NULL DEFAULT '[]'::jsonb,
  number_min INTEGER NOT NULL CHECK (number_min >= 0),
  number_max INTEGER NOT NULL CHECK (number_max > number_min),
  selection_count INTEGER NOT NULL CHECK (selection_count > 0 AND selection_count <= 50),
  entry_cost INTEGER NOT NULL DEFAULT 10 CHECK (entry_cost > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (number_max - number_min + 1 >= selection_count)
);

CREATE TABLE IF NOT EXISTS game_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  draw_at TIMESTAMPTZ NOT NULL,
  entry_closes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'drawn')),
  winning_numbers JSONB,
  drawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, draw_at),
  CHECK (entry_closes_at <= draw_at),
  CHECK ((status = 'drawn' AND winning_numbers IS NOT NULL AND drawn_at IS NOT NULL) OR status <> 'drawn')
);

CREATE TABLE IF NOT EXISTS game_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  draw_id UUID NOT NULL REFERENCES game_draws(id) ON DELETE RESTRICT,
  numbers JSONB NOT NULL,
  numbers_key TEXT NOT NULL,
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'won', 'lost')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, draw_id, numbers_key)
);

CREATE INDEX IF NOT EXISTS idx_game_draws_upcoming ON game_draws(status, draw_at);
CREATE INDEX IF NOT EXISTS idx_game_entries_user ON game_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_entries_draw ON game_entries(draw_id, created_at);

CREATE TABLE IF NOT EXISTS winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id UUID NOT NULL REFERENCES game_draws(id) ON DELETE RESTRICT,
  entry_id UUID NOT NULL UNIQUE REFERENCES game_entries(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  matched_count INTEGER NOT NULL CHECK (matched_count >= 0),
  prize_points INTEGER NOT NULL CHECK (prize_points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES game_entries(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  reason TEXT NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user ON point_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);

INSERT INTO games (name, slug, description, rules, prize_info, number_min, number_max, selection_count, entry_cost)
VALUES
  ('Drawline Pick 5', 'drawline-pick-5', 'Choose five unique numbers from 1 to 30. Match more numbers to win more virtual points.',
   '{"match_direction":"any","selection":"unique"}'::jsonb,
   '[{"matches":5,"points":500},{"matches":4,"points":100},{"matches":3,"points":25}]'::jsonb,
   1, 30, 5, 10)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO game_draws (game_id, draw_at, entry_closes_at)
SELECT id, NOW() + INTERVAL '1 day', NOW() + INTERVAL '23 hours'
FROM games
WHERE slug='drawline-pick-5'
  AND NOT EXISTS (SELECT 1 FROM game_draws existing WHERE existing.game_id=games.id AND existing.status <> 'drawn');

INSERT INTO lotteries (name, slug, description, draw_schedule)
VALUES
  ('Example Morning Draw', 'example-morning-draw', 'Demo category — replace with an authorized lottery name.', 'Example schedule; verify before publishing'),
  ('Example Evening Draw', 'example-evening-draw', 'Demo category — replace with an authorized lottery name.', 'Example schedule; verify before publishing')
ON CONFLICT (slug) DO NOTHING;
