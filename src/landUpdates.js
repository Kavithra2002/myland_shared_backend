import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { pool } from './db.js';
import { uploadsRoot } from './projects.js';

export const landUploadsDir = path.join(uploadsRoot, 'land-updates');

const CONTACT_STATUSES = ['new', 'contacted', 'closed'];
const STATUSES = [...CONTACT_STATUSES, 'deleted'];
const COLUMNS = `id, name, phone, email, location, land_size, notes, photos, status, created_at, updated_at`;

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS land_updates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL,
  land_size TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'closed', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_land_updates_created
  ON land_updates (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_land_updates_status
  ON land_updates (status, created_at DESC);
`;

export function ensureLandUploadDirs() {
  fs.mkdirSync(landUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureLandUploadDirs();
    cb(null, landUploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'];
    const safe = allowed.includes(ext) ? ext : '.jpg';
    cb(null, `land-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safe}`);
  },
});

export const landUpload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (String(file.mimetype || '').startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Please upload image files only.'));
  },
});

function isoDate(value) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function parsePhotos(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapLandUpdate(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || '',
    location: row.location,
    size: row.land_size || '',
    notes: row.notes || '',
    photos: parsePhotos(row.photos),
    status: row.status,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
  };
}

export async function migrateLandUpdatesSchema() {
  await pool.query(CREATE_SQL);
  await pool.query(`
    DO $$
    DECLARE
      conname text;
    BEGIN
      FOR conname IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
         WHERE t.relname = 'land_updates'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      LOOP
        EXECUTE format('ALTER TABLE land_updates DROP CONSTRAINT IF EXISTS %I', conname);
      END LOOP;
    END $$;
    ALTER TABLE land_updates ADD CONSTRAINT land_updates_status_check
      CHECK (status IN ('new', 'contacted', 'closed', 'deleted'));
  `);
}

export async function listLandUpdates({ status, includeDeleted } = {}) {
  const params = [];
  let where = '';
  if (status && STATUSES.includes(status)) {
    if (status === 'deleted' && !includeDeleted) return [];
    params.push(status);
    where = 'WHERE status = $1';
  } else if (!includeDeleted) {
    where = `WHERE status <> 'deleted'`;
  }
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM land_updates ${where} ORDER BY created_at DESC`,
    params
  );
  return rows.map(mapLandUpdate);
}

export function validateLandUpdateInput(body) {
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  const location = String(body.location || '').trim();
  const size = String(body.size || body.landSize || body.land_size || '').trim();
  const notes = String(body.notes || body.message || '').trim();
  const digits = phone.replace(/\D/g, '');

  if (!name || name.length < 2) return 'Please enter your name.';
  if (digits.length < 9) return 'Please enter a valid contact number.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email.';
  if (!location || location.length < 2) return 'Please tell us where the land is.';

  return {
    name,
    phone,
    email,
    location,
    size,
    notes,
  };
}

export async function createLandUpdate(fields, files = []) {
  const photos = (files || []).map((file) => `/api/uploads/land-updates/${file.filename}`);
  const id = `land-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await pool.query(
    `INSERT INTO land_updates (
       id, name, phone, email, location, land_size, notes, photos, status, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'new', NOW(), NOW())
     RETURNING ${COLUMNS}`,
    [
      id,
      fields.name,
      fields.phone,
      fields.email,
      fields.location,
      fields.size,
      fields.notes,
      JSON.stringify(photos),
    ]
  );
  return mapLandUpdate(rows[0]);
}

export async function updateLandUpdateStatus(id, status) {
  if (!CONTACT_STATUSES.includes(status)) {
    const err = new Error('Invalid status.');
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await pool.query(
    `UPDATE land_updates
        SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, status]
  );
  return rows[0] ? mapLandUpdate(rows[0]) : null;
}

export async function deleteLandUpdate(id) {
  const { rows } = await pool.query(
    `UPDATE land_updates
        SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id]
  );
  return rows[0] ? mapLandUpdate(rows[0]) : null;
}
