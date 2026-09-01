import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(backendDir, '..');

dotenv.config({ path: path.join(backendDir, '.env') });
dotenv.config({ path: path.join(rootDir, '.env') });

function isLocalHost(host) {
  return !host || host === 'localhost' || host === '127.0.0.1';
}

function buildSsl() {
  const mode = String(process.env.PGSSLMODE || '').toLowerCase();
  if (mode === 'disable' || process.env.PGSSL === 'false') return false;

  const host = process.env.PGHOST || '';
  const remote =
    Boolean(process.env.DATABASE_URL) ||
    process.env.PGSSL === 'true' ||
    mode === 'require' ||
    Boolean(process.env.CA_CERT) ||
    !isLocalHost(host);

  if (!remote) return false;

  const ssl = {
    rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false',
  };
  if (process.env.CA_CERT) {
    ssl.ca = process.env.CA_CERT.replace(/\\n/g, '\n');
  }
  return ssl;
}

const ssl = buildSsl();
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD ?? '',
      ssl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    };

export const pool = new pg.Pool(poolConfig);

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL,
  project_title TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moderated_at TIMESTAMPTZ,
  authorizer_id TEXT,
  authorizer_name TEXT,
  role TEXT,
  avatar_url TEXT,
  show_on_home BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_reviews_project_status
  ON reviews (project_slug, status);

CREATE INDEX IF NOT EXISTS idx_reviews_created_at
  ON reviews (created_at DESC);

CREATE TABLE IF NOT EXISTS blogs (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT 'Journal',
  image_url TEXT NOT NULL,
  read_time TEXT NOT NULL DEFAULT '3 min read',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  layout TEXT NOT NULL DEFAULT 'auto'
    CHECK (layout IN ('auto', 'image-left', 'image-right')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  placement TEXT NOT NULL DEFAULT 'index'
    CHECK (placement IN ('cover', 'features', 'index')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_blogs_sort
  ON blogs (sort_order ASC, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_blogs_published
  ON blogs (published, featured, sort_order);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  project_title TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  inquiry_type TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  project_slug TEXT,
  project_title TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  visit_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const REVIEW_COLUMNS = `id, project_slug, project_title, name, message, rating, status,
  created_at, moderated_at, authorizer_id, authorizer_name, role, avatar_url, show_on_home`;

function isoDate(value) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function mapReview(row) {
  return {
    id: row.id,
    projectSlug: row.project_slug,
    projectTitle: row.project_title,
    name: row.name,
    message: row.message,
    rating: row.rating,
    status: row.status,
    createdAt: isoDate(row.created_at),
    reviewedAt: isoDate(row.moderated_at),
    moderatedAt: isoDate(row.moderated_at),
    authorizerId: row.authorizer_id || undefined,
    authorizerName: row.authorizer_name || undefined,
    role: row.role || undefined,
    avatar: row.avatar_url || undefined,
    showOnHome: Boolean(row.show_on_home),
  };
}

const HOME_STORIES = [
  {
    id: 'rev-home-nadeesha',
    name: 'Nadeesha Perera',
    role: 'Homeowner, Malabe',
    message:
      'MyLand made an overwhelming process feel simple — every document was explained before we signed anything.',
    avatar: 'https://i.pravatar.cc/100?img=32',
    createdAt: '2026-07-12T08:00:00.000Z',
  },
  {
    id: 'rev-home-ruwan',
    name: 'Ruwan Fernando',
    role: 'Investor, Kandy',
    message:
      'I compared four agencies before choosing MyLand. Their site visit and follow-through were the most transparent by far.',
    avatar: 'https://i.pravatar.cc/100?img=12',
    createdAt: '2026-07-18T08:00:00.000Z',
  },
  {
    id: 'rev-home-ishara',
    name: 'Ishara Gunawardena',
    role: 'First-time buyer, Galle',
    message:
      'The team answered every question over WhatsApp within minutes, even on weekends. That responsiveness sold me.',
    avatar: 'https://i.pravatar.cc/100?img=45',
    createdAt: '2026-07-22T08:00:00.000Z',
  },
];

async function migrateSchema() {
  await pool.query(`
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS authorizer_id TEXT;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS authorizer_name TEXT;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS role TEXT;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE reviews
       SET authorizer_id = COALESCE(authorizer_id, 'admin-kavithra'),
           authorizer_name = COALESCE(authorizer_name, 'Kavithra')
     WHERE status IN ('approved', 'rejected')
       AND authorizer_name IS NULL;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_idempotency_key
      ON reviews (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    UPDATE reviews SET show_on_home = TRUE WHERE status = 'approved';
    UPDATE reviews SET show_on_home = FALSE WHERE status <> 'approved';
  `);
  await pool.query(`
    DO $$
    DECLARE
      conname text;
    BEGIN
      FOR conname IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
         WHERE t.relname = 'reviews'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      LOOP
        EXECUTE format('ALTER TABLE reviews DROP CONSTRAINT IF EXISTS %I', conname);
      END LOOP;
    END $$;
    ALTER TABLE reviews ADD CONSTRAINT reviews_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'deleted'));
  `);
}

async function syncClientStoryReviews() {
  for (const story of HOME_STORIES) {
    await pool.query(
      `INSERT INTO reviews (
         id, project_slug, project_title, name, message, rating, status,
         created_at, moderated_at, authorizer_id, authorizer_name,
         role, avatar_url, show_on_home
       ) VALUES ($1, 'client-stories', 'Client Stories', $2, $3, 5, 'approved',
         $4, NOW(), 'admin-kavithra', 'Kavithra', $5, $6, TRUE)
       ON CONFLICT (id) DO UPDATE SET
         status = 'approved',
         name = EXCLUDED.name,
         message = EXCLUDED.message,
         role = EXCLUDED.role,
         avatar_url = EXCLUDED.avatar_url,
         show_on_home = TRUE,
         authorizer_id = COALESCE(reviews.authorizer_id, 'admin-kavithra'),
         authorizer_name = COALESCE(reviews.authorizer_name, 'Kavithra'),
         moderated_at = COALESCE(reviews.moderated_at, NOW())
       WHERE reviews.status IS DISTINCT FROM 'deleted'`,
      [story.id, story.name, story.message, story.createdAt, story.role, story.avatar]
    );
  }
}

async function seedReviewsIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM reviews');
  if (rows[0].count > 0) return;

  const seedFile = path.join(rootDir, 'admin', 'data', 'reviews.json');
  if (!fs.existsSync(seedFile)) return;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  } catch {
    return;
  }

  const reviews = Array.isArray(parsed) ? parsed : parsed.reviews || [];
  for (const review of reviews) {
    await pool.query(
      `INSERT INTO reviews (
         id, project_slug, project_title, name, message, rating, status, created_at, moderated_at,
         authorizer_id, authorizer_name, role, avatar_url, show_on_home
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING`,
      [
        review.id,
        review.projectSlug,
        review.projectTitle,
        review.name,
        review.message,
        review.rating,
        review.status || 'pending',
        review.createdAt || new Date().toISOString(),
        review.moderatedAt || null,
        review.authorizerId || null,
        review.authorizerName || null,
        review.role || null,
        review.avatar || null,
        Boolean(review.showOnHome),
      ]
    );
  }
}

export async function pingDb() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

export async function connectDb() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    await client.query(CREATE_SQL);
  } finally {
    client.release();
  }
  await migrateSchema();
  await seedReviewsIfEmpty();
  await syncClientStoryReviews();
}

export async function listReviews({ project, status, home } = {}) {
  const params = [];
  const where = [];
  if (project) {
    params.push(project);
    where.push(`project_slug = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (home) {
    where.push('show_on_home = TRUE');
  }
  const sql = `
    SELECT ${REVIEW_COLUMNS}
    FROM reviews
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at ${home ? 'ASC' : 'DESC'}
  `;
  const { rows } = await pool.query(sql, params);
  return rows.map(mapReview);
}

export async function createReview({
  projectSlug,
  projectTitle,
  name,
  message,
  rating,
  idempotencyKey,
}) {
  const key = String(idempotencyKey || '').trim() || null;

  if (key) {
    const existing = await pool.query(
      `SELECT ${REVIEW_COLUMNS} FROM reviews WHERE idempotency_key = $1`,
      [key]
    );
    if (existing.rows[0]) return mapReview(existing.rows[0]);
  }

  const duplicate = await pool.query(
    `SELECT ${REVIEW_COLUMNS}
       FROM reviews
      WHERE project_slug = $1
        AND name = $2
        AND message = $3
        AND rating = $4
        AND status = 'pending'
        AND created_at > NOW() - INTERVAL '15 minutes'
      ORDER BY created_at DESC
      LIMIT 1`,
    [projectSlug, name, message, rating]
  );
  if (duplicate.rows[0]) return mapReview(duplicate.rows[0]);

  const id = `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { rows } = await pool.query(
      `INSERT INTO reviews (
         id, project_slug, project_title, name, message, rating, status, created_at, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), $7)
       RETURNING ${REVIEW_COLUMNS}`,
      [id, projectSlug, projectTitle || projectSlug, name, message, rating, key]
    );
    return mapReview(rows[0]);
  } catch (err) {
    if (key && err?.code === '23505') {
      const existing = await pool.query(
        `SELECT ${REVIEW_COLUMNS} FROM reviews WHERE idempotency_key = $1`,
        [key]
      );
      if (existing.rows[0]) return mapReview(existing.rows[0]);
    }
    throw err;
  }
}

export async function updateReviewStatus(id, status, { authorizerId, authorizerName } = {}) {
  const { rows } = await pool.query(
    `UPDATE reviews
     SET status = $2,
         moderated_at = NOW(),
         authorizer_id = COALESCE($3, authorizer_id),
         authorizer_name = COALESCE($4, authorizer_name),
         show_on_home = ($2 = 'approved')
     WHERE id = $1
     RETURNING ${REVIEW_COLUMNS}`,
    [id, status, authorizerId || null, authorizerName || null]
  );
  return rows[0] ? mapReview(rows[0]) : null;
}

export async function deleteReview(id, { authorizerId, authorizerName } = {}) {
  return updateReviewStatus(id, 'deleted', { authorizerId, authorizerName });
}
