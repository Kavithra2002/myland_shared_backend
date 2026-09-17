import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { pool } from './db.js';
import { findUserById } from './users.js';
import { notifyListingReviewed, notifyListingSubmitted } from './mail.js';
import { RETIRED_WEBSITE_SLUGS, WEBSITE_PROJECTS } from './websiteProjects.js';
import { syncWebsiteProjectMedia } from './websiteProjectMedia.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
export const projectUploadsDir = path.join(uploadsRoot, 'projects');

const PHASES = ['Ongoing', 'Completed'];
const LISTING_STATUSES = ['For Sale', 'Sold', 'Completed'];
const ROW_STATUSES = ['active', 'deleted'];
const LISTING_TYPES = ['Residential Lands', 'Commercial Lands'];

const PROJECT_COLUMNS = `id, slug, title, location, district, listing_type, country, category,
  property_type, phase, listing_status, badges, price, price_from, land_area, excerpt, overview,
  description, image_url, gallery, plot_plan_url, video_url, map_query, show_on_projects,
  published, row_status, created_at, updated_at, approval_status, pending_action, pending_payload,
  approver_id, requested_by, approval_message, requested_at, reviewed_at`;

const PROJECT_SELECT = PROJECT_COLUMNS.split(',')
  .map((item) => `p.${item.trim()}`)
  .join(', ');

const PROJECT_FROM = `projects p
  LEFT JOIN users requester ON requester.user_id = p.requested_by
  LEFT JOIN users approver ON approver.user_id = p.approver_id`;

const PROJECT_USER_FIELDS = `requester.name AS requested_by_name,
      requester.email AS requested_by_email,
      approver.name AS approver_name,
      approver.email AS approver_email`;

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  district TEXT NOT NULL DEFAULT '',
  listing_type TEXT NOT NULL DEFAULT 'Residential Lands',
  country TEXT NOT NULL DEFAULT 'Sri Lanka',
  category TEXT NOT NULL DEFAULT 'Real Estate',
  property_type TEXT NOT NULL DEFAULT 'Land',
  phase TEXT NOT NULL DEFAULT 'Ongoing',
  listing_status TEXT NOT NULL DEFAULT 'For Sale',
  badges TEXT[] NOT NULL DEFAULT '{}',
  price TEXT NOT NULL DEFAULT '',
  price_from NUMERIC,
  land_area TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL DEFAULT '',
  description TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT NOT NULL DEFAULT '',
  gallery JSONB NOT NULL DEFAULT '[]',
  plot_plan_url TEXT,
  video_url TEXT NOT NULL DEFAULT '',
  map_query TEXT NOT NULL DEFAULT '',
  show_on_projects BOOLEAN NOT NULL DEFAULT TRUE,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  row_status TEXT NOT NULL DEFAULT 'active',
  approval_status TEXT NOT NULL DEFAULT 'approved',
  pending_action TEXT NOT NULL DEFAULT 'none',
  pending_payload JSONB,
  approver_id INTEGER,
  requested_by INTEGER,
  approval_message TEXT,
  requested_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects (slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (row_status, published, created_at DESC);
`;

export function ensureUploadDirs() {
  fs.mkdirSync(projectUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDirs();
    cb(null, projectUploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const imageExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const videoExt = ['.mp4', '.webm', '.ogg', '.mov', '.m4v'];
    let safe = '.jpg';
    if (imageExt.includes(ext) || videoExt.includes(ext)) safe = ext;
    else if (String(file.mimetype || '').startsWith('video/')) safe = '.mp4';
    cb(null, `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safe}`);
  },
});

export const projectUpload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    const type = String(file.mimetype || '');
    if (type.startsWith('image/') || type.startsWith('video/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Please upload an image or video file.'));
  },
});

function isoDate(value) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function asUrlArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return [];
}

function buildBadges(listingStatus, hotOffer, badges) {
  if (Array.isArray(badges) && badges.length) {
    return [...new Set(asStringArray(badges))];
  }
  const next = [];
  if (listingStatus === 'Sold') next.push('Sold');
  else if (listingStatus === 'Completed') next.push('Completed');
  else next.push('For Sale');
  if (hotOffer) next.push('Hot Offer');
  return next;
}

export function mapProject(row) {
  if (!row) return null;
  const gallery = Array.isArray(row.gallery) ? row.gallery : [];
  const image = row.image_url || gallery[0] || '';
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    location: row.location,
    district: row.district || '',
    listingType: row.listing_type,
    country: row.country,
    category: row.category,
    propertyType: row.property_type,
    phase: row.phase,
    status: row.listing_status,
    badges: Array.isArray(row.badges) ? row.badges : [],
    price: row.price,
    priceFrom: row.price_from == null ? null : Number(row.price_from),
    landArea: row.land_area || '',
    excerpt: row.excerpt || '',
    overview: row.overview || '',
    description: Array.isArray(row.description) ? row.description : [],
    image,
    imageUrl: image,
    gallery,
    plotPlan: row.plot_plan_url || undefined,
    videoUrl: row.video_url || '',
    mapQuery: row.map_query || row.location || '',
    showOnProjects: Boolean(row.show_on_projects),
    published: Boolean(row.published),
    rowStatus: row.row_status,
    approvalStatus: row.approval_status || 'approved',
    pendingAction: row.pending_action || 'none',
    pendingPayload: row.pending_payload || null,
    approverId: row.approver_id || undefined,
    requestedBy: row.requested_by || undefined,
    approverName: row.approver_name || undefined,
    requestedByName: row.requested_by_name || undefined,
    approverEmail: row.approver_email || undefined,
    requestedByEmail: row.requested_by_email || undefined,
    approvalMessage: row.approval_message || undefined,
    requestedAt: isoDate(row.requested_at),
    reviewedAt: isoDate(row.reviewed_at),
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
    source: 'admin',
  };
}

function publicProject(project) {
  if (!project) return null;
  return {
    ...project,
    pendingPayload: undefined,
    pendingAction: undefined,
    approvalStatus: undefined,
    approverId: undefined,
    requestedBy: undefined,
    approverName: undefined,
    requestedByName: undefined,
    approverEmail: undefined,
    requestedByEmail: undefined,
    approvalMessage: undefined,
    requestedAt: undefined,
    reviewedAt: undefined,
  };
}

export async function migrateProjectsSchema() {
  ensureUploadDirs();
  await pool.query(CREATE_SQL);
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS pending_action TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS pending_payload JSONB;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS approver_id INTEGER;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS requested_by INTEGER;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_message TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
  `);
}

export async function seedWebsiteProjects() {
  let added = 0;
  let updated = 0;
  for (const item of WEBSITE_PROJECTS) {
    const existing = await getProject(item.slug, { publicOnly: false });
    const payload = {
      ...item,
      country: item.country || 'Sri Lanka',
      propertyType: item.propertyType || 'Land',
      videoUrl: item.videoUrl || 'https://www.youtube.com/@myland1014',
      published: true,
      rowStatus: 'active',
      showOnProjects: item.showOnProjects !== false,
    };
    if (!existing) {
      await createProject(payload);
      added += 1;
    } else {
      await updateProject(existing.id, {
        ...payload,
        imageUrl: existing.imageUrl || existing.image,
        gallery: existing.gallery,
        plotPlan: existing.plotPlan,
      });
      updated += 1;
    }
  }
  if (RETIRED_WEBSITE_SLUGS.length) {
    const { rowCount } = await pool.query(
      `UPDATE projects
          SET published = FALSE,
              show_on_projects = FALSE,
              row_status = 'deleted',
              updated_at = NOW()
        WHERE slug = ANY($1::text[])
          AND row_status <> 'deleted'`,
      [RETIRED_WEBSITE_SLUGS]
    );
    if (rowCount) console.log(`retired ${rowCount} old website projects`);
  }
  if (added) console.log(`seeded ${added} website projects`);
  if (updated) console.log(`updated ${updated} website projects`);
  await syncWebsiteProjectMedia();
}

function newId() {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function validateProjectInput(body, { partial = false } = {}) {
  const title = body.title != null ? String(body.title).trim() : undefined;
  const location = body.location != null ? String(body.location).trim() : undefined;
  const overview = body.overview != null ? String(body.overview).trim() : undefined;
  const imageUrl = String(body.imageUrl || body.image || '').trim();
  const price = body.price != null ? String(body.price).trim() : undefined;

  if (!partial || body.title != null) {
    if (!title || title.length < 3) return 'Please enter a project title.';
  }
  if (!partial || body.location != null) {
    if (!location || location.length < 3) return 'Please enter a location.';
  }
  if (!partial || body.overview != null) {
    if (!overview || overview.length < 8) return 'Please write a short overview.';
  }
  if (!partial || body.price != null) {
    if (!price) return 'Please enter the display price.';
  }
  if (!partial || body.imageUrl != null || body.image != null) {
    if (!partial && !imageUrl) return 'Please add a cover photo.';
    if ((body.imageUrl != null || body.image != null) && imageUrl && imageUrl.length < 4) {
      return 'Please add a valid cover photo.';
    }
  }
  if (body.phase != null && !PHASES.includes(body.phase)) return 'Invalid project phase.';
  if (body.status != null && !LISTING_STATUSES.includes(body.status)) return 'Invalid listing status.';
  if (body.listingType != null && !LISTING_TYPES.includes(body.listingType)) {
    return 'Invalid listing type.';
  }
  if (body.rowStatus != null && !ROW_STATUSES.includes(body.rowStatus)) return 'Invalid row status.';
  return null;
}

function normalizePayload(body, current = {}) {
  const title = String(body.title ?? current.title ?? '').trim();
  const listingStatus = LISTING_STATUSES.includes(body.status)
    ? body.status
    : current.status || 'For Sale';
  const hotOffer = body.hotOffer != null ? Boolean(body.hotOffer) : (current.badges || []).includes('Hot Offer');
  const imageUrl = String(body.imageUrl || body.image || current.imageUrl || current.image || '').trim();
  const gallery = asUrlArray(body.gallery != null ? body.gallery : current.gallery);
  const photos = [...new Set([imageUrl, ...gallery].filter(Boolean))];
  const slugSource = String(body.slug || current.slug || title).trim();
  const priceFromRaw = body.priceFrom ?? current.priceFrom;
  const priceFrom =
    priceFromRaw === '' || priceFromRaw == null || Number.isNaN(Number(priceFromRaw))
      ? null
      : Number(priceFromRaw);

  return {
    slug: slugify(slugSource) || slugify(title) || `project-${Date.now().toString(36)}`,
    title,
    location: String(body.location ?? current.location ?? '').trim(),
    district: String(body.district ?? current.district ?? '').trim(),
    listingType: LISTING_TYPES.includes(body.listingType)
      ? body.listingType
      : current.listingType || 'Residential Lands',
    country: String(body.country ?? current.country ?? 'Sri Lanka').trim() || 'Sri Lanka',
    category: String(body.category ?? current.category ?? 'Real Estate').trim() || 'Real Estate',
    propertyType: String(body.propertyType ?? current.propertyType ?? 'Land').trim() || 'Land',
    phase: PHASES.includes(body.phase) ? body.phase : current.phase || 'Ongoing',
    listingStatus,
    badges: buildBadges(listingStatus, hotOffer, body.badges),
    price: String(body.price ?? current.price ?? '').trim(),
    priceFrom,
    landArea: String(body.landArea ?? current.landArea ?? '').trim(),
    excerpt: String(body.excerpt ?? current.excerpt ?? '').trim(),
    overview: String(body.overview ?? current.overview ?? '').trim(),
    description: asStringArray(body.description != null ? body.description : current.description),
    imageUrl,
    gallery: photos,
    plotPlanUrl: String(body.plotPlan || body.plotPlanUrl || current.plotPlan || '').trim() || null,
    videoUrl: body.videoUrl != null ? String(body.videoUrl).trim() : String(current.videoUrl || '').trim(),
    mapQuery: String(body.mapQuery ?? current.mapQuery ?? body.location ?? current.location ?? '').trim(),
    showOnProjects: body.showOnProjects != null ? Boolean(body.showOnProjects) : current.showOnProjects !== false,
    published: body.published != null ? Boolean(body.published) : current.published !== false,
    rowStatus: ROW_STATUSES.includes(body.rowStatus) ? body.rowStatus : current.rowStatus || 'active',
  };
}

export async function listProjects({ includeUnpublished = false, includeDeleted = false } = {}) {
  const where = [];
  if (!includeDeleted) where.push(`p.row_status = 'active'`);
  if (!includeUnpublished) where.push(`p.published = TRUE`);
  const sql = `
    SELECT ${PROJECT_SELECT},
      ${PROJECT_USER_FIELDS}
    FROM ${PROJECT_FROM}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.created_at DESC
  `;
  const { rows } = await pool.query(sql);
  const projects = rows.map(mapProject);
  return includeUnpublished ? projects : projects.map(publicProject);
}

export async function getProject(idOrSlug, { publicOnly = true } = {}) {
  const { rows } = await pool.query(
    `SELECT ${PROJECT_SELECT},
        ${PROJECT_USER_FIELDS}
       FROM ${PROJECT_FROM}
      WHERE p.id = $1 OR p.slug = $1
      LIMIT 1`,
    [idOrSlug]
  );
  const project = mapProject(rows[0]);
  if (!project) return null;
  if (publicOnly && (project.rowStatus !== 'active' || !project.published)) return null;
  return publicOnly ? publicProject(project) : project;
}

export async function createProject(body) {
  const data = normalizePayload(body);
  const id = newId();
  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (
         id, slug, title, location, district, listing_type, country, category, property_type,
         phase, listing_status, badges, price, price_from, land_area, excerpt, overview,
         description, image_url, gallery, plot_plan_url, video_url, map_query, show_on_projects,
         published, row_status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, $20::jsonb, $21, $22, $23, $24,
         $25, $26
       )
       RETURNING ${PROJECT_COLUMNS}`,
      [
        id,
        data.slug,
        data.title,
        data.location,
        data.district,
        data.listingType,
        data.country,
        data.category,
        data.propertyType,
        data.phase,
        data.listingStatus,
        data.badges,
        data.price,
        data.priceFrom,
        data.landArea,
        data.excerpt,
        data.overview,
        data.description,
        data.imageUrl,
        JSON.stringify(data.gallery),
        data.plotPlanUrl,
        data.videoUrl,
        data.mapQuery,
        data.showOnProjects,
        data.published,
        data.rowStatus,
      ]
    );
    return mapProject(rows[0]);
  } catch (err) {
    if (err?.code === '23505') {
      const error = new Error('A project with this slug already exists. Change the title or slug.');
      error.statusCode = 409;
      throw error;
    }
    throw err;
  }
}

export async function updateProject(id, body) {
  const current = await getProject(id, { publicOnly: false });
  if (!current) return null;
  const data = normalizePayload(body, current);
  try {
    const { rows } = await pool.query(
      `UPDATE projects SET
         slug = $2,
         title = $3,
         location = $4,
         district = $5,
         listing_type = $6,
         country = $7,
         category = $8,
         property_type = $9,
         phase = $10,
         listing_status = $11,
         badges = $12,
         price = $13,
         price_from = $14,
         land_area = $15,
         excerpt = $16,
         overview = $17,
         description = $18,
         image_url = $19,
         gallery = $20::jsonb,
         plot_plan_url = $21,
         video_url = $22,
         map_query = $23,
         show_on_projects = $24,
         published = $25,
         row_status = $26,
         updated_at = NOW()
       WHERE id = $1
       RETURNING ${PROJECT_COLUMNS}`,
      [
        current.id,
        data.slug,
        data.title,
        data.location,
        data.district,
        data.listingType,
        data.country,
        data.category,
        data.propertyType,
        data.phase,
        data.listingStatus,
        data.badges,
        data.price,
        data.priceFrom,
        data.landArea,
        data.excerpt,
        data.overview,
        data.description,
        data.imageUrl,
        JSON.stringify(data.gallery),
        data.plotPlanUrl,
        data.videoUrl,
        data.mapQuery,
        data.showOnProjects,
        data.published,
        data.rowStatus,
      ]
    );
    return mapProject(rows[0]);
  } catch (err) {
    if (err?.code === '23505') {
      const error = new Error('A project with this slug already exists. Change the title or slug.');
      error.statusCode = 409;
      throw error;
    }
    throw err;
  }
}

export async function deleteProject(id) {
  const { rows } = await pool.query(
    `UPDATE projects
        SET row_status = 'deleted', published = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING ${PROJECT_COLUMNS}`,
    [id]
  );
  return mapProject(rows[0]);
}

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function changePayload(input = {}) {
  const payload = {};
  const keys = [
    'title',
    'slug',
    'location',
    'district',
    'listingType',
    'country',
    'category',
    'propertyType',
    'phase',
    'status',
    'hotOffer',
    'badges',
    'price',
    'priceFrom',
    'landArea',
    'excerpt',
    'overview',
    'description',
    'imageUrl',
    'image',
    'gallery',
    'plotPlan',
    'plotPlanUrl',
    'videoUrl',
    'mapQuery',
    'showOnProjects',
    'published',
  ];
  keys.forEach((key) => {
    if (input[key] !== undefined) payload[key] = input[key];
  });
  return payload;
}

async function markPending(id, { action, payload, approverId, requestedBy }) {
  await pool.query(
    `UPDATE projects SET
       approval_status = 'pending',
       pending_action = $2,
       pending_payload = $3::jsonb,
       approver_id = $4,
       requested_by = $5,
       approval_message = NULL,
       requested_at = NOW(),
       reviewed_at = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [id, action, payload ? JSON.stringify(payload) : null, approverId, requestedBy]
  );
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

export async function submitProjectChange(input, { actor } = {}) {
  if (!actor?.userId) throw httpError('Please sign in.', 401);
  if (actor.role === 'admin') {
    throw httpError('Admins approve or decline listing requests. They cannot add or edit projects.', 403);
  }
  const approverId = await requireAdminApprover(input.approverId);
  const action = ['create', 'update', 'delete'].includes(input.action) ? input.action : 'update';
  const payload = changePayload(input.payload || input);

  if (action === 'create') {
    const error = validateProjectInput({ ...payload, published: false });
    if (error && error !== 'Please add a cover photo.') throw httpError(error, 400);
    if (!payload.title || String(payload.title).trim().length < 3) {
      throw httpError('Please enter a project title.', 400);
    }
    const project = await createProject({ ...payload, published: false });
    await markPending(project.id, {
      action: 'create',
      payload,
      approverId,
      requestedBy: actor.userId,
    });
    const created = await getProject(project.id, { publicOnly: false });
    await notifyListingSubmitted(created, { actor });
    return created;
  }

  const current = await getProject(input.projectId || input.id, { publicOnly: false });
  if (!current || current.rowStatus === 'deleted') throw httpError('Project not found.', 404);

  if (action === 'delete') {
    await markPending(current.id, {
      action: 'delete',
      payload: null,
      approverId,
      requestedBy: actor.userId,
    });
    const pendingDelete = await getProject(current.id, { publicOnly: false });
    await notifyListingSubmitted(pendingDelete, { actor });
    return pendingDelete;
  }

  await markPending(current.id, {
    action: 'update',
    payload,
    approverId,
    requestedBy: actor.userId,
  });
  const pendingUpdate = await getProject(current.id, { publicOnly: false });
  await notifyListingSubmitted(pendingUpdate, { actor });
  return pendingUpdate;
}

export async function reviewProjectChange(id, input, { actor } = {}) {
  if (!actor?.userId) throw httpError('Please sign in.', 401);
  const current = await getProject(id, { publicOnly: false });
  if (!current) throw httpError('Project not found.', 404);
  if (current.rowStatus === 'deleted') throw httpError('This project is already deleted.', 400);
  if (current.approvalStatus !== 'pending') {
    throw httpError('This listing is not waiting for approval.', 400);
  }

  const decision =
    input.status === 'approved' || input.status === 'declined' ? input.status : null;
  if (!decision) throw httpError('Choose approve or decline.', 400);

  const message = String(input.message || '').trim();
  if (decision === 'declined' && message.length < 3) {
    throw httpError('Please add a short message explaining the decline.', 400);
  }

  if (decision === 'declined') {
    await pool.query(
      `UPDATE projects SET
         approval_status = 'declined',
         approval_message = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [id, message]
    );
    const declined = await getProject(id, { publicOnly: false });
    await notifyListingReviewed(declined, { actor, decision: 'declined' });
    return declined;
  }

  const action = current.pendingAction;
  const payload = current.pendingPayload || {};

  if (action === 'delete') {
    await deleteProject(id);
    await pool.query(
      `UPDATE projects SET
         approval_status = 'approved',
         pending_action = 'none',
         pending_payload = NULL,
         approval_message = $2,
         reviewed_at = NOW()
       WHERE id = $1`,
      [id, message]
    );
    const deleted = await getProject(id, { publicOnly: false });
    await notifyListingReviewed(deleted || current, { actor, decision: 'approved' });
    return deleted;
  }

  if (action === 'create' || action === 'update') {
    await updateProject(id, { ...payload, published: true, rowStatus: 'active' });
  }

  await pool.query(
    `UPDATE projects SET
       approval_status = 'approved',
       pending_action = 'none',
       pending_payload = NULL,
       published = TRUE,
       approval_message = $2,
       reviewed_at = NOW(),
       updated_at = NOW()
     WHERE id = $1 AND row_status = 'active'`,
    [id, message]
  );
  const approved = await getProject(id, { publicOnly: false });
  await notifyListingReviewed(approved, { actor, decision: 'approved' });
  return approved;
}
