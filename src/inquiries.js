import { pool } from './db.js';

const INQUIRY_TYPES = ['visit', 'price', 'loan', 'general'];
const SOURCES = ['project', 'contact', 'whatsapp'];

const COLUMNS = `id, project_slug, project_title, name, phone, whatsapp, email, inquiry_type, message, source, status, created_at`;

function cleanNumber(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return '';
  return raw;
}

function mapInquiry(row) {
  if (!row) return null;
  const source = SOURCES.includes(row.source) ? row.source : 'project';
  const phone = cleanNumber(row.phone);
  const whatsapp = cleanNumber(row.whatsapp);
  return {
    id: row.id,
    projectSlug: row.project_slug || '',
    projectTitle: row.project_title || '',
    name: row.name || '',
    phone: source === 'whatsapp' ? '' : phone,
    whatsapp: source === 'whatsapp' ? whatsapp || phone : whatsapp,
    email: row.email || '',
    inquiryType: row.inquiry_type || '',
    message: row.message || '',
    source,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function migrateInquiriesSchema() {
  await pool.query(`
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS pending_action VARCHAR(50);
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS requested_by INTEGER;
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS pending_payload JSONB;
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS approver_id INTEGER;
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'project';
    ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS project_slug TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    UPDATE inquiries
    SET source = 'whatsapp',
        whatsapp = CASE
          WHEN COALESCE(TRIM(whatsapp), '') IN ('', '-') THEN phone
          ELSE whatsapp
        END,
        phone = ''
    WHERE name = '-'
      AND COALESCE(source, 'project') <> 'whatsapp'
      AND COALESCE(TRIM(phone), '') NOT IN ('', '-')
      AND COALESCE(TRIM(whatsapp), '') IN ('', '-', phone)
  `);
}

export async function listInquiries({ status } = {}) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM inquiries ${where} ORDER BY created_at DESC`,
    params
  );
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
  const phoneRaw = cleanNumber(body.phone || body.contactNumber);
  const whatsappRaw = cleanNumber(body.whatsapp);
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
    if (waDigits.length < 9 && phoneDigits.length < 9) {
      return { error: 'Please enter a valid WhatsApp number.' };
    }
  } else {
    if (!name || name.length < 2) return { error: 'Please enter your name.' };
    if (phoneDigits.length < 9) return { error: 'Please enter a valid contact number.' };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email.' };
  }
  if ((source === 'project' || source === 'whatsapp') && !projectTitle && !projectSlug) {
    return { error: 'Project is required.' };
  }

  return {
    data: {
      name: name || '-',
      phone: source === 'whatsapp' ? '' : phoneRaw,
      whatsapp: source === 'whatsapp' ? whatsappRaw || phoneRaw : whatsappRaw,
      email,
      message,
      projectSlug,
      projectTitle: projectTitle || projectSlug,
      source,
      inquiryType,
    },
  };
}

export async function createInquiry(input) {
  const id = `inq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const source = SOURCES.includes(input.source) ? input.source : 'project';
  const phone = source === 'whatsapp' ? '' : cleanNumber(input.phone || input.contactNumber);
  const whatsapp =
    source === 'whatsapp'
      ? cleanNumber(input.whatsapp || input.phone || input.contactNumber)
      : cleanNumber(input.whatsapp);
  const { rows } = await pool.query(
    `INSERT INTO inquiries (
      id, project_slug, project_title, name, phone, whatsapp, email, inquiry_type, message, source, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new')
    RETURNING ${COLUMNS}`,
    [
      id,
      input.projectSlug || '',
      input.projectTitle || '',
      input.name || '-',
      phone,
      whatsapp,
      input.email || '',
      input.inquiryType || 'general',
      input.message || '',
      source,
    ]
  );
  return mapInquiry(rows[0]);
}

export async function updateInquiryStatus(id, status) {
  const { rows } = await pool.query(
    `UPDATE inquiries SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status]
  );
  return rows[0] ? mapInquiry(rows[0]) : null;
}

export async function deleteInquiry(id) {
  return updateInquiryStatus(id, 'deleted');
}
