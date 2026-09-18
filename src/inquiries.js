import { pool } from './db.js';

const INQUIRY_TYPES = ['visit', 'price', 'loan', 'general'];
const SOURCES = ['project', 'contact', 'whatsapp'];

const COLUMNS = `id, project_title, name, phone, email, inquiry_type, message, status, created_at`;

function mapInquiry(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectTitle: row.project_title || '',
    name: row.name || '',
    phone: row.phone || '',
    whatsapp: row.phone || '',
    email: row.email || '',
    inquiryType: row.inquiry_type || '',
    message: row.message || '',
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
  const phoneRaw = String(body.phone || body.contactNumber || '').trim();
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
    if (waDigits.length < 9) return { error: 'Please enter a valid WhatsApp number.' };
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
      phone: source === 'whatsapp' ? whatsappRaw : phoneRaw,
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
  const phone = input.phone || input.whatsapp || input.contactNumber || '';
  const { rows } = await pool.query(
    `INSERT INTO inquiries (
      id, project_title, name, phone, email, inquiry_type, message, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
    RETURNING ${COLUMNS}`,
    [
      id,
      input.projectTitle || '',
      input.name || '-',
      phone,
      input.email || '',
      input.inquiryType || 'general',
      input.message || '',
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