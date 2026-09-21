import { pool } from './db.js';

const BLOG_PAGE_KEY = 'blog_page_enabled';

function asBoolean(value, fallback = true) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}

function mapSettings(rows) {
  const values = Object.fromEntries((rows || []).map((row) => [row.key, row.value]));
  return {
    blogPageEnabled: asBoolean(values[BLOG_PAGE_KEY], true),
  };
}

export async function migrateSiteSettingsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `INSERT INTO site_settings (key, value)
     VALUES ($1, 'true')
     ON CONFLICT (key) DO NOTHING`,
    [BLOG_PAGE_KEY]
  );
}

export async function getSiteSettings() {
  const { rows } = await pool.query('SELECT key, value FROM site_settings');
  return mapSettings(rows);
}

export async function isBlogPageEnabled() {
  const settings = await getSiteSettings();
  return settings.blogPageEnabled;
}

export async function updateSiteSettings({ blogPageEnabled } = {}) {
  if (typeof blogPageEnabled === 'boolean') {
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = NOW()`,
      [BLOG_PAGE_KEY, blogPageEnabled ? 'true' : 'false']
    );
  }
  return getSiteSettings();
}
