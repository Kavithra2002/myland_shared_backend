import { pool } from './db.js';

const CONTACT_STATUSES = ['new', 'in_progress', 'closed'];
const STATUSES = [...CONTACT_STATUSES, 'deleted'];
const INQUIRY_TYPES = ['visit', 'price', 'loan', 'general'];
const SOURCES = ['project', 'contact', 'whatsapp'];

const COLUMNS = `id, project_slug, project_title, name, phone, whatsapp, email,
  inquiry_type, message, source, status, created_at, updated_at`;

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL DEFAULT '',
  project_title TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  inquiry_type TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'project',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'closed', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_created
  ON inquiries (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inquiries_status
  ON inquiries (status, created_at DESC);
`;

function isoDate(value) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function mapInquiry(row) {
  return {
    id: row.id,
    projectSlug: row.project_slug || '',
    projectTitle: row.project_title || '',
    name: row.name,
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    email: row.email || '',
    inquiryType: row.inquiry_type || 'general',
    message: row.message || '',
    source: row.source || 'project',
    status: row.status,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
  };
}

export async function migrateInquiriesSchema() {
  await pool.query(CREATE_SQL);
  await pool.query(`
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS project_slug TEXT NOT NULL DEFAULT '';
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS project_title TEXT;
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS inquiry_type TEXT NOT NULL DEFAULT 'general';
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'project';
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    UPDATE inquiries SET whatsapp = phone WHERE (whatsapp IS NULL OR whatsapp = '') AND phone IS NOT NULL;
    UPDATE inquiries SET source = 'project' WHERE source IS NULL OR source = '';
    UPDATE inquiries SET inquiry_type = 'general' WHERE inquiry_type IS NULL OR inquiry_type = '';
    UPDATE inquiries SET project_title = COALESCE(project_title, '');
    UPDATE inquiries SET phone = COALESCE(phone, '');
    UPDATE inquiries SET email = COALESCE(email, '');
    UPDATE inquiries SET message = COALESCE(message, '');
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
         WHERE t.relname = 'inquiries'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      LOOP
        EXECUTE format('ALTER TABLE inquiries DROP CONSTRAINT IF EXISTS %I', conname);
      END LOOP;
    END $$;
    ALTER TABLE inquiries ADD CONSTRAINT inquiries_status_check
      CHECK (status IN ('new', 'in_progress', 'closed', 'deleted'));
  `);
}

export async function listInquiries({ status, includeDeleted, since, limit } = {}) {
  const params = [];
  const where = [];
  if (status && STATUSES.includes(status)) {
    if (status === 'deleted' && !includeDeleted) return [];
    params.push(status);
    where.push(`status = $${params.length}`);
  } else if (!includeDeleted) {
    where.push(`status <> 'deleted'`);
  }
  if (since) {
    const date = new Date(since);
    if (!Number.isNaN(date.getTime())) {
      params.push(date.toISOString());
      where.push(`created_at > $${params.length}`);
    }
  }
  let limitSql = '';
  if (limit != null) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    params.push(take);
    limitSql = `LIMIT $${params.length}`;
  }
  const sql = `
    SELECT ${COLUMNS}
    FROM inquiries
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC
    ${limitSql}
  `;
  const { rows } = await pool.query(sql, params);
  return rows.map(mapInquiry);
}

export function validateInquiryInput(body) {
  const sourceHint = String(body.source || '').trim();
  const projectSlug = String(body.projectSlug || '').trim();
  const projectTitle = String(body.projectTitle || '').trim();
  const source = SOURCES.includes(sourceHint)
    ? sourceHint
    : projectSlug
      ? 'project'
      : 'contact';
  const name = String(body.name || '').trim() || (source === 'whatsapp' ? '-' : '');
  const phoneRaw = String(body.phone || '').trim();
  const whatsappRaw = String(body.whatsapp || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  const inquiryType = INQUIRY_TYPES.includes(body.inquiryType)
    ? body.inquiryType
    : INQUIRY_TYPES.includes(body.inquiry_type)
      ? body.inquiry_type
      : 'general';

  const phoneDigits = phoneRaw.replace(/\D/g, '');
  const waDigits = whatsappRaw.replace(/\D/g, '');

  if (source === 'whatsapp') {
    if (waDigits.length < 9) return 'Please enter a valid WhatsApp number.';
  } else {
    if (!name || name.length < 2) return 'Please enter your name.';
    if (phoneDigits.length < 9) return 'Please enter a valid contact number.';
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email.';
  if ((source === 'project' || source === 'whatsapp') && !projectTitle && !projectSlug) {
    return 'Project is required.';
  }

  return {
    name: name || '-',
    phone: source === 'whatsapp' ? '-' : phoneRaw,
    whatsapp: source === 'whatsapp' ? whatsappRaw : '-',
    email,
    message,
    projectSlug,
    projectTitle: projectTitle || projectSlug,
    source,
    inquiryType,
  };
}

export async function createInquiry(fields) {
  const duplicate = await pool.query(
    `SELECT ${COLUMNS}
       FROM inquiries
      WHERE project_slug = $1
        AND status <> 'deleted'
        AND created_at > NOW() - INTERVAL '15 minutes'
        AND (
          ($2 <> '-' AND phone = $2)
          OR ($3 <> '-' AND whatsapp = $3)
        )
      ORDER BY created_at DESC
      LIMIT 1`,
    [fields.projectSlug, fields.phone, fields.whatsapp]
  );
  if (duplicate.rows[0]) return { inquiry: mapInquiry(duplicate.rows[0]), created: false };

  const id = `inq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await pool.query(
    `INSERT INTO inquiries (
       id, project_slug, project_title, name, phone, whatsapp, email,
       inquiry_type, message, source, status, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new', NOW(), NOW())
     RETURNING ${COLUMNS}`,
    [
      id,
      fields.projectSlug,
      fields.projectTitle,
      fields.name,
      fields.phone,
      fields.whatsapp,
      fields.email,
      fields.inquiryType,
      fields.message,
      fields.source,
    ]
  );
  return { inquiry: mapInquiry(rows[0]), created: true };
}

export async function updateInquiryStatus(id, status) {
  if (!CONTACT_STATUSES.includes(status)) {
    const err = new Error('Invalid status.');
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await pool.query(
    `UPDATE inquiries
        SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, status]
  );
  return rows[0] ? mapInquiry(rows[0]) : null;
}

export async function deleteInquiry(id) {
  const { rows } = await pool.query(
    `UPDATE inquiries
        SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id]
  );
  return rows[0] ? mapInquiry(rows[0]) : null;
}
