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

const config = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD ?? '',
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
};

export const pool = new pg.Pool(config);

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL,
  project_title TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moderated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reviews_project_status
  ON reviews (project_slug, status);

CREATE INDEX IF NOT EXISTS idx_reviews_created_at
  ON reviews (created_at DESC);

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

function mapReview(row) {
  return {
    id: row.id,
    projectSlug: row.project_slug,
    projectTitle: row.project_title,
    name: row.name,
    message: row.message,
    rating: row.rating,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    moderatedAt:
      row.moderated_at instanceof Date
        ? row.moderated_at.toISOString()
        : row.moderated_at || undefined,
  };
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
         id, project_slug, project_title, name, message, rating, status, created_at, moderated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
  await seedReviewsIfEmpty();
}

export async function listReviews({ project, status } = {}) {
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
  const sql = `
    SELECT id, project_slug, project_title, name, message, rating, status, created_at, moderated_at
    FROM reviews
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC
  `;
  const { rows } = await pool.query(sql, params);
  return rows.map(mapReview);
}

export async function createReview({ projectSlug, projectTitle, name, message, rating }) {
  const id = `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await pool.query(
    `INSERT INTO reviews (
       id, project_slug, project_title, name, message, rating, status, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
     RETURNING id, project_slug, project_title, name, message, rating, status, created_at, moderated_at`,
    [id, projectSlug, projectTitle || projectSlug, name, message, rating]
  );
  return mapReview(rows[0]);
}

export async function updateReviewStatus(id, status) {
  const { rows } = await pool.query(
    `UPDATE reviews
     SET status = $2, moderated_at = NOW()
     WHERE id = $1
     RETURNING id, project_slug, project_title, name, message, rating, status, created_at, moderated_at`,
    [id, status]
  );
  return rows[0] ? mapReview(rows[0]) : null;
}

export async function deleteReview(id) {
  const { rowCount } = await pool.query('DELETE FROM reviews WHERE id = $1', [id]);
  return rowCount > 0;
}
