import { pool } from './db.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapSubscriber(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    lastMailedAt: row.last_mailed_at || null,
  };
}

export async function migrateNewsletterSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_mailed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_newsletter_created
      ON newsletter_subscribers (created_at DESC);
  `);
}

export function validateSubscriberEmail(body) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Please enter a valid email.' };
  return { data: { email } };
}

export async function createSubscriber(email) {
  const id = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await pool.query(
    `INSERT INTO newsletter_subscribers (id, email)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, email, created_at, last_mailed_at`,
    [id, email]
  );
  return mapSubscriber(rows[0]);
}

export async function listSubscribers() {
  const { rows } = await pool.query(
    `SELECT id, email, created_at, last_mailed_at
     FROM newsletter_subscribers
     ORDER BY created_at DESC`
  );
  return rows.map(mapSubscriber);
}

export async function getSubscriber(id) {
  const { rows } = await pool.query(
    `SELECT id, email, created_at, last_mailed_at
     FROM newsletter_subscribers
     WHERE id = $1`,
    [id]
  );
  return mapSubscriber(rows[0]);
}

const TEST_ALERT_EMAILS = [
  'plot.alert.test1@example.com',
  'plot.alert.test2@example.com',
  'plot.alert.test3@example.com',
  'plot.alert.test4@example.com',
  'plot.alert.test5@example.com',
  'plot.alert.test6@example.com',
  'plot.alert.test7@example.com',
  'plot.alert.test8@example.com',
];

export async function seedTestSubscribers() {
  for (let i = 0; i < TEST_ALERT_EMAILS.length; i += 1) {
    await pool.query(
      `INSERT INTO newsletter_subscribers (id, email, created_at)
       VALUES ($1, $2, NOW() - ($3 * INTERVAL '1 minute'))
       ON CONFLICT (email) DO NOTHING`,
      [`sub-test-${i + 1}`, TEST_ALERT_EMAILS[i], i + 1]
    );
  }
}

export async function markSubscriberMailed(id) {
  const { rows } = await pool.query(
    `UPDATE newsletter_subscribers
     SET last_mailed_at = NOW()
     WHERE id = $1
     RETURNING id, email, created_at, last_mailed_at`,
    [id]
  );
  return mapSubscriber(rows[0]);
}
