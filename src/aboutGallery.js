import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { uploadsRoot } from './projects.js';
import { findUserById } from './users.js';
import { notifyGalleryReviewed, notifyGallerySubmitted } from './mail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_IMAGES = path.resolve(__dirname, '../../client/src/images');
const GALLERY_ID = 'about';
const MAX_IMAGES = 48;

export const galleryUploadsDir = path.join(uploadsRoot, 'gallery');

const DEFAULT_IMAGES = [
  { file: 'new/avilable/Balummahara/6.png', alt: 'Paved junction and marked plots at Balummahara' },
  { file: 'new/avilable/Divulapitiya/Divulapitiya_03.jpg', alt: 'Coconut-grove plots at Field Breeze, Divulapitiya' },
  { file: 'new/avilable/Kirindivela/DRONE.00_09_36_07.Still005.jpg', alt: 'Aerial view of Serenity Park, Kirindivela' },
  { file: 'new/avilable/Meerigama/WhatsApp Image 2025-08-29 at 11.17.35.jpeg', alt: 'Access road and flagged lots at Meerigama' },
  { file: 'new/sold out/Dompe/20180908_081321.jpg', alt: 'Completed internal road with Myland flags at Dompe' },
  { file: 'new/sold out/Kiribathgoda/20180519_133404.jpg', alt: 'Handed-over plot and site wall at Kiribathgoda' },
  { file: 'new/avilable/Balummahara/12.png', alt: 'Asphalt roads meeting open lots at Balummahara' },
  { file: 'new/avilable/Divulapitiya/Divulapitiya_18.jpg', alt: 'Palm-lined internal road at Divulapitiya' },
  { file: 'new/avilable/Kirindivela/01 drone.jpg', alt: 'Coconut plots from the air at Kirindivela' },
  { file: 'new/avilable/Meerigama/WhatsApp Image 2025-08-29 at 11.17.25 (1).jpeg', alt: 'Marked plots and site office at Meerigama' },
  { file: 'new/sold out/Dompe/20180908_120622.jpg', alt: 'Young palms along the boundary wall at Dompe' },
  { file: 'new/sold out/Kiribathgoda/20180519_133508.jpg', alt: 'Residential lots and flags at Kiribathgoda' },
  { file: 'new/avilable/Balummahara/5.png', alt: 'Finished internal road network at Balummahara' },
  { file: 'new/avilable/Divulapitiya/Divulapitiya_09.jpg', alt: 'Road-front plot markers at Divulapitiya' },
  { file: 'new/avilable/Kirindivela/DRONE.00_07_27_15.Still003.jpg', alt: 'Plotted roads and lots from above at Kirindivela' },
  { file: 'new/avilable/Meerigama/WhatsApp Image 2025-08-29 at 11.17.33 (1).jpeg', alt: 'Boundary posts and numbered lots at Meerigama' },
  { file: 'new/sold out/Dompe/20180908_081344.jpg', alt: 'Road frontage and planted lots at Dompe' },
  { file: 'new/sold out/Kiribathgoda/20180519_103039.jpg', alt: 'Completed Kiribathgoda development near town' },
];

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS about_gallery (
  id TEXT PRIMARY KEY,
  images JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approval_status TEXT NOT NULL DEFAULT 'approved',
  pending_payload JSONB,
  approver_id INTEGER,
  requested_by INTEGER,
  approval_message TEXT,
  requested_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
);
`;

export function ensureGalleryUploadDirs() {
  fs.mkdirSync(galleryUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureGalleryUploadDirs();
    cb(null, galleryUploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'];
    const safe = allowed.includes(ext) ? ext : '.jpg';
    cb(null, `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safe}`);
  },
});

export const galleryUpload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (String(file.mimetype || '').startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Please upload image files only.'));
  },
});

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function isoDate(value) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function parseImages(value) {
  let items = value;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === 'string') return { src: item, alt: '' };
      const src = String(item?.src || item?.url || '').trim();
      if (!src) return null;
      return { src, alt: String(item?.alt || '').trim() };
    })
    .filter(Boolean);
}

function normalizeImages(input) {
  const images = parseImages(input);
  if (!images.length) {
    throw httpError('Add at least one gallery photo before saving.', 400);
  }
  if (images.length > MAX_IMAGES) {
    throw httpError(`The gallery can hold up to ${MAX_IMAGES} photos.`, 400);
  }
  return images;
}

function publicUrl(destFile) {
  const relative = path.relative(uploadsRoot, destFile).replace(/\\/g, '/');
  return `/api/uploads/${relative}`;
}

function copyClientImage(relativeFrom, destFile) {
  const from = path.join(CLIENT_IMAGES, relativeFrom);
  if (!fs.existsSync(from)) return '';
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.copyFileSync(from, destFile);
  return publicUrl(destFile);
}

export async function migrateAboutGallerySchema() {
  await pool.query(CREATE_SQL);
  await pool.query(`
    ALTER TABLE about_gallery ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
    ALTER TABLE about_gallery ADD COLUMN IF NOT EXISTS pending_payload JSONB;
    ALTER TABLE about_gallery ADD COLUMN IF NOT EXISTS approver_id INTEGER;
    ALTER TABLE about_gallery ADD COLUMN IF NOT EXISTS requested_by INTEGER;
    ALTER TABLE about_gallery ADD COLUMN IF NOT EXISTS approval_message TEXT;
    ALTER TABLE about_gallery ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
    ALTER TABLE about_gallery ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
  `);
}

function pendingImagesFrom(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return parseImages(payload);
  return parseImages(payload.images);
}

function mapGallery(row, { includePending = false } = {}) {
  const gallery = {
    images: parseImages(row?.images),
    updatedAt: isoDate(row?.updated_at),
  };
  if (!includePending) return gallery;
  return {
    ...gallery,
    approvalStatus: row?.approval_status || 'approved',
    pendingImages: pendingImagesFrom(row?.pending_payload),
    pendingAction: row?.approval_status === 'pending' ? 'update' : 'none',
    approverId: row?.approver_id || undefined,
    requestedBy: row?.requested_by || undefined,
    approverName: row?.approver_name || undefined,
    requestedByName: row?.requested_by_name || undefined,
    approverEmail: row?.approver_email || undefined,
    requestedByEmail: row?.requested_by_email || undefined,
    approvalMessage: row?.approval_message || undefined,
    requestedAt: isoDate(row?.requested_at),
    reviewedAt: isoDate(row?.reviewed_at),
  };
}

async function loadGalleryRow() {
  const { rows } = await pool.query(
    `SELECT g.images, g.updated_at, g.approval_status, g.pending_payload,
            g.approver_id, g.requested_by, g.approval_message, g.requested_at, g.reviewed_at,
            requester.name AS requested_by_name,
            requester.email AS requested_by_email,
            approver.name AS approver_name,
            approver.email AS approver_email
       FROM about_gallery g
       LEFT JOIN users requester ON requester.user_id = g.requested_by
       LEFT JOIN users approver ON approver.user_id = g.approver_id
      WHERE g.id = $1`,
    [GALLERY_ID]
  );
  return rows[0] || null;
}

async function ensureGalleryRow() {
  await pool.query(
    `INSERT INTO about_gallery (id, images)
     VALUES ($1, '[]'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [GALLERY_ID]
  );
}

export async function getAboutGallery({ includePending = false } = {}) {
  const row = await loadGalleryRow();
  return mapGallery(row, { includePending });
}

export async function saveAboutGallery(input) {
  const images = normalizeImages(input);
  await ensureGalleryRow();
  await pool.query(
    `UPDATE about_gallery
        SET images = $2::jsonb,
            updated_at = NOW()
      WHERE id = $1`,
    [GALLERY_ID, JSON.stringify(images)]
  );
  return getAboutGallery();
}

async function requireAdminApprover(approverId) {
  const id = Number(approverId);
  if (!Number.isInteger(id)) {
    throw httpError('Please select an admin to approve this change.', 400);
  }
  const admin = await findUserById(id);
  if (!admin || admin.role !== 'admin' || admin.user_status !== 'active') {
    throw httpError('That admin is not available.', 400);
  }
  return id;
}

export async function submitAboutGalleryChange(input, { actor } = {}) {
  if (!actor?.userId) throw httpError('Please sign in.', 401);
  if (actor.role === 'admin') {
    throw httpError('Admins approve or decline gallery requests. They cannot edit the gallery.', 403);
  }
  const images = normalizeImages(input?.images);
  const approverId = await requireAdminApprover(input?.approverId);
  await ensureGalleryRow();
  await pool.query(
    `UPDATE about_gallery SET
       approval_status = 'pending',
       pending_payload = $2::jsonb,
       approver_id = $3,
       requested_by = $4,
       approval_message = NULL,
       requested_at = NOW(),
       reviewed_at = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [GALLERY_ID, JSON.stringify({ images }), approverId, actor.userId]
  );
  const gallery = await getAboutGallery({ includePending: true });
  await notifyGallerySubmitted(gallery, { actor });
  return gallery;
}

export async function reviewAboutGalleryChange(input, { actor } = {}) {
  if (!actor?.userId) throw httpError('Please sign in.', 401);
  const current = await getAboutGallery({ includePending: true });
  if (current.approvalStatus !== 'pending') {
    throw httpError('The gallery is not waiting for approval.', 400);
  }

  const decision =
    input?.status === 'approved' || input?.status === 'declined' ? input.status : null;
  if (!decision) throw httpError('Choose approve or decline.', 400);

  const message = String(input?.message || '').trim();
  if (decision === 'declined' && message.length < 3) {
    throw httpError('Please add a short message explaining the decline.', 400);
  }

  if (decision === 'declined') {
    await pool.query(
      `UPDATE about_gallery SET
         approval_status = 'declined',
         approval_message = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [GALLERY_ID, message]
    );
    const declined = await getAboutGallery({ includePending: true });
    await notifyGalleryReviewed(declined, { actor, decision: 'declined' });
    return declined;
  }

  const images = normalizeImages(current.pendingImages);
  await pool.query(
    `UPDATE about_gallery SET
       images = $2::jsonb,
       approval_status = 'approved',
       pending_payload = NULL,
       approval_message = $3,
       reviewed_at = NOW(),
       updated_at = NOW()
     WHERE id = $1`,
    [GALLERY_ID, JSON.stringify(images), message]
  );
  const approved = await getAboutGallery({ includePending: true });
  await notifyGalleryReviewed(approved, { actor, decision: 'approved' });
  return approved;
}

export async function seedAboutGalleryIfEmpty() {
  const current = await getAboutGallery();
  if (current.images.length) return;
  if (!fs.existsSync(CLIENT_IMAGES)) return;

  ensureGalleryUploadDirs();
  const websiteDir = path.join(galleryUploadsDir, 'website');
  fs.mkdirSync(websiteDir, { recursive: true });

  const images = DEFAULT_IMAGES.map((item, index) => {
    const ext = path.extname(item.file || '').toLowerCase() || '.jpg';
    const dest = path.join(websiteDir, `${String(index + 1).padStart(2, '0')}${ext}`);
    const src = copyClientImage(item.file, dest);
    return src ? { src, alt: item.alt } : null;
  }).filter(Boolean);

  if (!images.length) return;
  await pool.query(
    `INSERT INTO about_gallery (id, images, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE
        SET images = EXCLUDED.images,
            updated_at = NOW()
      WHERE about_gallery.images = '[]'::jsonb`,
    [GALLERY_ID, JSON.stringify(images)]
  );
  console.log(`seeded about gallery with ${images.length} photos`);
}
