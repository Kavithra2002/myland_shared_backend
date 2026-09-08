import { pool } from './db.js';
import { findUserById } from './users.js';

const BLOG_COLUMNS = `id, slug, title, excerpt, body, topic, image_url, read_time,
  featured, layout, sort_order, published, published_at, created_at, updated_at,
  placement, status, approval_status, pending_action, pending_payload,
  approver_id, requested_by, approval_message, requested_at, reviewed_at`;

const BLOG_SELECT = `b.id, b.slug, b.title, b.excerpt, b.body, b.topic, b.image_url, b.read_time,
  b.featured, b.layout, b.sort_order, b.published, b.published_at, b.created_at, b.updated_at,
  b.placement, b.status, b.approval_status, b.pending_action, b.pending_payload,
  b.approver_id, b.requested_by, b.approval_message, b.requested_at, b.reviewed_at,
  requester.name AS requested_by_name,
  approver.name AS approver_name,
  approver.email AS approver_email`;

const BLOG_FROM = `blogs b
  LEFT JOIN users requester ON requester.user_id = b.requested_by
  LEFT JOIN users approver ON approver.user_id = b.approver_id`;

const APPROVAL_STATUSES = ['pending', 'approved', 'declined'];
const PENDING_ACTIONS = ['none', 'create', 'update', 'delete', 'move'];

const PLACEMENTS = ['cover', 'features', 'index'];

const SEED_POSTS = [
  {
    id: 'blog-001',
    slug: 'clear-title-why-it-matters',
    title: 'Why a clear title is the whole deal',
    excerpt:
      'Survey plans, deed history, and the red flags we refuse to list — so you are not discovering them after reservation.',
    body: `A plot can look perfect from the road and still be the wrong buy if the deed is not clean. We start with the survey plan, then walk the chain of title until every transfer is accounted for.

Red flags we will not list: overlapping plans, unsigned partitions, and "the lawyer is still checking" with no date attached. If those show up, the listing stays off Find Land.

When you book a MyLand site visit, the advisor brings the same pack we used to approve the project — so the paperwork conversation happens on the ground, not after you have already reserved.`,
    topic: 'Titles',
    imageUrl:
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2000&auto=format&fit=crop',
    readTime: '4 min read',
    featured: true,
    layout: 'auto',
    sortOrder: 0,
    placement: 'cover',
    publishedAt: '2023-12-12T08:00:00.000Z',
  },
  {
    id: 'blog-002',
    slug: 'slice-of-paradise-sri-lanka-land',
    title: 'Finding your slice of paradise without the paperwork fog',
    excerpt:
      'What to look for on a first site visit — road access, deed clarity, and the questions that separate a good plot from a rushed one.',
    body: `The first site visit is not a brochure walk. Ask how you reach the plot in monsoon, where the deed line actually sits, and whether three-phase power is on site or "coming soon".

We pause at the boundary stones, the drain, and the nearest public road. Those three minutes usually tell you more than a drone video.

If a seller rushes you past the plan, that is the signal. MyLand listings are walked the same way every time so you can compare plots fairly.`,
    topic: 'Site visits',
    imageUrl:
      'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop',
    readTime: '3 min read',
    featured: false,
    layout: 'image-left',
    sortOrder: 1,
    placement: 'features',
    publishedAt: '2024-05-08T08:00:00.000Z',
  },
  {
    id: 'blog-003',
    slug: 'commercial-land-sri-lanka',
    title: 'When a residential plot is not the right buy',
    excerpt:
      'How commercial-frontage lots differ from family plots, and which MyLand listings are built for clinics, offices, and mixed-use.',
    body: `A family plot and a clinic lot are priced on different things: frontage, parking, and what the local authority will actually permit.

If you are buying for a practice or a small office, walk the main-road edge and check turning radius before you fall in love with the view.

We mark mixed-use listings clearly so you are not converting a quiet residential lane after the fact.`,
    topic: 'Investment',
    imageUrl:
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1600&auto=format&fit=crop',
    readTime: '4 min read',
    featured: false,
    layout: 'image-right',
    sortOrder: 2,
    placement: 'features',
    publishedAt: '2024-04-22T08:00:00.000Z',
  },
  {
    id: 'blog-004',
    slug: 'gampaha-vs-colombo-first-buyers',
    title: 'Gampaha or Colombo: where first-time buyers actually start',
    excerpt:
      'A practical comparison of commute, plot size, and starting price across the two corridors most MyLand families ask about.',
    body: `Most first-time buyers are choosing between a larger Gampaha plot and a shorter Colombo commute. There is no universal winner — only the one that matches school runs, work, and budget.

We compare perch size, asking price, and the real drive at 7:30am, not the map's optimistic minutes.

Book two visits on the same weekend if you can. Walking both corridors back to back is the fastest way to decide.`,
    topic: 'Districts',
    imageUrl:
      'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=1600&auto=format&fit=crop',
    readTime: '3 min read',
    featured: false,
    layout: 'auto',
    sortOrder: 3,
    placement: 'index',
    publishedAt: '2024-03-18T08:00:00.000Z',
  },
  {
    id: 'blog-005',
    slug: 'bank-loans-for-bare-land',
    title: 'How bank loans work on bare land in Sri Lanka',
    excerpt:
      'Reservation, 30% down, and the documents lenders usually request — explained in the order you will actually need them.',
    body: `Bare land loans are slower than house loans because the bank is valuing dirt and a deed, not a finished building. Start with the reservation letter, then the survey, then the 30% conversation.

Lenders typically want a clean title pack, valuation, and proof of income in that order. Missing one item is what stalls a file for weeks.

A MyLand advisor can tell you which of our listings already have packs banks have seen before — that is the practical shortcut.`,
    topic: 'Loans',
    imageUrl:
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1600&auto=format&fit=crop',
    readTime: '5 min read',
    featured: false,
    layout: 'auto',
    sortOrder: 4,
    placement: 'index',
    publishedAt: '2024-02-09T08:00:00.000Z',
  },
  {
    id: 'blog-006',
    slug: 'what-a-site-visit-should-cover',
    title: 'What a proper MyLand site visit should cover',
    excerpt:
      'Boundaries, drainage, electricity, and the five-minute walk that tells you more than any brochure photo.',
    body: `A proper visit is a loop: entrance road, plot, drain, power, and the five-minute walk to the nearest junction. If any of those is skipped, ask to go back.

Boundaries should be pointed out on the plan and on the ground. Drainage is the item buyers forget until the first heavy rain.

We keep visits unhurried on purpose. The goal is that you leave with questions answered, not a brochure in the car.`,
    topic: 'Site visits',
    imageUrl:
      'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=1600&auto=format&fit=crop',
    readTime: '2 min read',
    featured: false,
    layout: 'auto',
    sortOrder: 5,
    placement: 'index',
    publishedAt: '2024-01-24T08:00:00.000Z',
  },
];

function isoDate(value) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function formatDisplayDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function estimateReadTime(text) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 180) || 1);
  return `${minutes} min read`;
}

export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function mapBlog(row) {
  const approvalStatus = APPROVAL_STATUSES.includes(row.approval_status)
    ? row.approval_status
    : 'approved';
  const pendingAction = PENDING_ACTIONS.includes(row.pending_action) ? row.pending_action : 'none';
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body || '',
    topic: row.topic,
    image: row.image_url,
    imageUrl: row.image_url,
    readTime: row.read_time,
    featured: Boolean(row.featured),
    layout: row.layout || 'auto',
    sortOrder: row.sort_order,
    published: Boolean(row.published),
    placement: PLACEMENTS.includes(row.placement) ? row.placement : 'index',
    status: row.status === 'deleted' ? 'deleted' : 'active',
    approvalStatus,
    pendingAction,
    pendingPayload: parsePayload(row.pending_payload),
    approverId: row.approver_id || undefined,
    approverName: row.approver_name || undefined,
    approverEmail: row.approver_email || undefined,
    requestedBy: row.requested_by || undefined,
    requestedByName: row.requested_by_name || undefined,
    approvalMessage: row.approval_message || '',
    requestedAt: isoDate(row.requested_at),
    reviewedAt: isoDate(row.reviewed_at),
    publishedAt: isoDate(row.published_at),
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
    date: formatDisplayDate(row.published_at),
  };
}

export async function migrateBlogsSchema() {
  await pool.query(`
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS placement TEXT NOT NULL DEFAULT 'index';
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS pending_action TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS pending_payload JSONB;
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS approver_id INTEGER;
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS requested_by INTEGER;
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS approval_message TEXT;
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
    ALTER TABLE blogs ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
  `);
  await pool.query(`
    UPDATE blogs
       SET approval_status = 'pending',
           pending_action = CASE WHEN pending_action = 'none' THEN 'create' ELSE pending_action END
     WHERE published = FALSE
       AND status = 'active'
       AND approval_status = 'approved'
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
         WHERE t.relname = 'blogs'
           AND c.contype = 'c'
           AND (
             pg_get_constraintdef(c.oid) ILIKE '%placement%'
             OR pg_get_constraintdef(c.oid) ILIKE '%status%'
             OR pg_get_constraintdef(c.oid) ILIKE '%approval_status%'
             OR pg_get_constraintdef(c.oid) ILIKE '%pending_action%'
           )
      LOOP
        EXECUTE format('ALTER TABLE blogs DROP CONSTRAINT IF EXISTS %I', conname);
      END LOOP;
    END $$;
    ALTER TABLE blogs ADD CONSTRAINT blogs_placement_check
      CHECK (placement IN ('cover', 'features', 'index'));
    ALTER TABLE blogs ADD CONSTRAINT blogs_status_check
      CHECK (status IN ('active', 'deleted'));
    ALTER TABLE blogs ADD CONSTRAINT blogs_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'declined'));
    ALTER TABLE blogs ADD CONSTRAINT blogs_pending_action_check
      CHECK (pending_action IN ('none', 'create', 'update', 'delete', 'move'));
  `);
  await backfillPlacements();
}

async function backfillPlacements() {
  const { rows: covers } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM blogs WHERE placement = 'cover' AND status = 'active'`
  );
  if (covers[0].count > 0) return;

  const { rows } = await pool.query(
    `SELECT id, featured FROM blogs WHERE status = 'active'
     ORDER BY featured DESC, sort_order ASC, published_at DESC`
  );
  if (!rows.length) return;

  for (let i = 0; i < rows.length; i += 1) {
    const placement = i === 0 ? 'cover' : i <= 2 ? 'features' : 'index';
    await pool.query(
      `UPDATE blogs SET placement = $2, featured = $3 WHERE id = $1`,
      [rows[i].id, placement, placement === 'cover']
    );
  }
}

export async function seedBlogsIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM blogs');
  if (rows[0].count > 0) return;

  for (const post of SEED_POSTS) {
    await pool.query(
      `INSERT INTO blogs (
         id, slug, title, excerpt, body, topic, image_url, read_time,
         featured, layout, sort_order, published, published_at, created_at, updated_at,
         placement, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, $12, $12, $12, $13, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [
        post.id,
        post.slug,
        post.title,
        post.excerpt,
        post.body,
        post.topic,
        post.imageUrl,
        post.readTime,
        post.featured,
        post.layout,
        post.sortOrder,
        post.publishedAt,
        post.placement || 'index',
      ]
    );
  }
}

export async function listBlogs({ published, status } = {}) {
  const params = [];
  const where = [];
  if (published === true) {
    where.push('b.published = TRUE');
    where.push(`b.status = 'active'`);
  } else if (published === false) {
    where.push('b.published = FALSE');
  }
  if (status) {
    params.push(status);
    where.push(`b.status = $${params.length}`);
  }
  const sql = `
    SELECT ${BLOG_SELECT}
    FROM ${BLOG_FROM}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY
      CASE b.placement WHEN 'cover' THEN 0 WHEN 'features' THEN 1 ELSE 2 END,
      b.sort_order ASC,
      b.published_at DESC,
      b.created_at DESC
  `;
  const { rows } = await pool.query(sql, params);
  return rows.map(mapBlog);
}

export async function getBlog(idOrSlug, { publicOnly = false } = {}) {
  const { rows } = await pool.query(
    `SELECT ${BLOG_SELECT} FROM ${BLOG_FROM} WHERE b.id = $1 OR b.slug = $1 LIMIT 1`,
    [idOrSlug]
  );
  const blog = rows[0] ? mapBlog(rows[0]) : null;
  if (!blog) return null;
  if (publicOnly && (!blog.published || blog.status === 'deleted')) return null;
  return blog;
}

async function uniqueSlug(base, excludeId) {
  let slug = base || `post-${Date.now().toString(36)}`;
  let n = 2;
  for (;;) {
    const { rows } = await pool.query(
      excludeId
        ? 'SELECT id FROM blogs WHERE slug = $1 AND id <> $2 LIMIT 1'
        : 'SELECT id FROM blogs WHERE slug = $1 LIMIT 1',
      excludeId ? [slug, excludeId] : [slug]
    );
    if (!rows.length) return slug;
    slug = `${base}-${n}`;
    n += 1;
  }
}

async function nextSortOrder() {
  const { rows } = await pool.query('SELECT COALESCE(MIN(sort_order), 0) - 1 AS next FROM blogs');
  return rows[0].next;
}

async function trimFeatures(keepId) {
  const { rows } = await pool.query(
    `SELECT id FROM blogs
      WHERE placement = 'features' AND status = 'active'
      ORDER BY sort_order ASC, published_at DESC`
  );
  const keep = keepId ? [keepId, ...rows.map((row) => row.id).filter((id) => id !== keepId)] : rows.map((row) => row.id);
  const extra = keep.slice(2);
  for (const id of extra) {
    await pool.query(
      `UPDATE blogs SET placement = 'index', featured = FALSE, updated_at = NOW() WHERE id = $1`,
      [id]
    );
  }
}

export async function setBlogPlacement(id, placement, { actorRole } = {}) {
  if (!PLACEMENTS.includes(placement)) return null;
  const current = await getBlog(id);
  if (!current || current.status === 'deleted') return null;
  const canPublish = actorRole !== 'user';

  if (placement === 'cover') {
    await pool.query(
      `UPDATE blogs
          SET placement = 'features', featured = FALSE, updated_at = NOW()
        WHERE placement = 'cover' AND status = 'active' AND id <> $1`,
      [id]
    );
    await pool.query(
      `UPDATE blogs
          SET placement = 'cover', featured = TRUE, published = $2, updated_at = NOW()
        WHERE id = $1`,
      [id, canPublish ? true : current.published]
    );
    await trimFeatures();
  } else if (placement === 'features') {
    await pool.query(
      `UPDATE blogs
          SET placement = 'features', featured = FALSE, updated_at = NOW()
        WHERE id = $1`,
      [id]
    );
    await trimFeatures(id);
  } else {
    await pool.query(
      `UPDATE blogs
          SET placement = 'index', featured = FALSE, updated_at = NOW()
        WHERE id = $1`,
      [id]
    );
  }
  return getBlog(id);
}

export async function createBlog(input, { actorRole } = {}) {
  const title = String(input.title || '').trim();
  const excerpt = String(input.excerpt || '').trim();
  const body = String(input.body || '').trim();
  const topic = String(input.topic || 'Journal').trim() || 'Journal';
  const imageUrl = String(input.imageUrl || input.image || '').trim();
  const layout = ['auto', 'image-left', 'image-right'].includes(input.layout)
    ? input.layout
    : 'auto';
  const published = actorRole === 'user' ? false : input.published !== false;
  const placement = PLACEMENTS.includes(input.placement) ? input.placement : 'index';
  const featured = placement === 'cover';
  const readTime =
    String(input.readTime || '').trim() || estimateReadTime(`${excerpt} ${body}`);
  const slug = await uniqueSlug(slugify(input.slug || title) || `post-${Date.now().toString(36)}`);
  const id = `blog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const sortOrder =
    Number.isInteger(Number(input.sortOrder)) && input.sortOrder !== '' && input.sortOrder != null
      ? Number(input.sortOrder)
      : await nextSortOrder();
  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();

  const { rows } = await pool.query(
    `INSERT INTO blogs (
       id, slug, title, excerpt, body, topic, image_url, read_time,
       featured, layout, sort_order, published, published_at, created_at, updated_at,
       placement, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW(), $14, 'active')
     RETURNING ${BLOG_COLUMNS}`,
    [
      id,
      slug,
      title,
      excerpt,
      body,
      topic,
      imageUrl,
      readTime,
      featured,
      layout,
      sortOrder,
      published,
      publishedAt,
      placement,
    ]
  );
  const blog = mapBlog(rows[0]);
  if (placement !== 'index' && published) {
    await setBlogPlacement(blog.id, placement, { actorRole });
  }
  return getBlog(blog.id);
}

export async function updateBlog(id, input, { actorRole } = {}) {
  const current = await getBlog(id);
  if (!current) return null;

  const title = input.title != null ? String(input.title).trim() : current.title;
  const excerpt = input.excerpt != null ? String(input.excerpt).trim() : current.excerpt;
  const body = input.body != null ? String(input.body).trim() : current.body;
  const topic = input.topic != null ? String(input.topic).trim() || 'Journal' : current.topic;
  const imageUrl =
    input.imageUrl != null || input.image != null
      ? String(input.imageUrl || input.image).trim()
      : current.image;
  const layout = ['auto', 'image-left', 'image-right'].includes(input.layout)
    ? input.layout
    : current.layout;
  const published =
    actorRole === 'user'
      ? false
      : input.published != null
        ? Boolean(input.published)
        : current.published;
  const status = input.status === 'deleted' || input.status === 'active' ? input.status : current.status;
  const placement = PLACEMENTS.includes(input.placement) ? input.placement : current.placement;
  const featured = placement === 'cover' && status === 'active';
  const readTime =
    input.readTime != null && String(input.readTime).trim()
      ? String(input.readTime).trim()
      : current.readTime || estimateReadTime(`${excerpt} ${body}`);
  const slug =
    input.slug != null
      ? await uniqueSlug(slugify(input.slug) || current.slug, id)
      : current.slug;
  const sortOrder =
    input.sortOrder != null && input.sortOrder !== ''
      ? Number(input.sortOrder)
      : current.sortOrder;
  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : current.publishedAt;

  const { rows } = await pool.query(
    `UPDATE blogs SET
       slug = $2,
       title = $3,
       excerpt = $4,
       body = $5,
       topic = $6,
       image_url = $7,
       read_time = $8,
       featured = $9,
       layout = $10,
       sort_order = $11,
       published = $12,
       published_at = $13,
       placement = $14,
       status = $15,
       updated_at = NOW()
     WHERE id = $1
     RETURNING ${BLOG_COLUMNS}`,
    [
      id,
      slug,
      title,
      excerpt,
      body,
      topic,
      imageUrl,
      readTime,
      featured,
      layout,
      sortOrder,
      status === 'deleted' ? false : published,
      publishedAt,
      status === 'deleted' ? current.placement : placement,
      status,
    ]
  );
  const blog = rows[0] ? mapBlog(rows[0]) : null;
  if (blog && status === 'active' && placement !== current.placement) {
    return setBlogPlacement(blog.id, placement, { actorRole });
  }
  return blog;
}

export async function deleteBlog(id) {
  const { rows } = await pool.query(
    `UPDATE blogs
        SET status = 'deleted',
            published = FALSE,
            featured = FALSE,
            updated_at = NOW()
      WHERE id = $1
      RETURNING ${BLOG_COLUMNS}`,
    [id]
  );
  return rows[0] ? mapBlog(rows[0]) : null;
}

export async function reorderBlog(id, direction) {
  const current = await getBlog(id);
  if (!current) return null;
  const blogs = (await listBlogs()).filter(
    (item) => item.status === 'active' && item.placement === current.placement
  );
  const index = blogs.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= blogs.length) return current;

  const a = blogs[index];
  const b = blogs[swapWith];
  await pool.query('UPDATE blogs SET sort_order = $2, updated_at = NOW() WHERE id = $1', [
    a.id,
    b.sortOrder,
  ]);
  await pool.query('UPDATE blogs SET sort_order = $2, updated_at = NOW() WHERE id = $1', [
    b.id,
    a.sortOrder,
  ]);
  return getBlog(id);
}

function changePayload(input = {}) {
  const payload = {};
  if (input.title != null) payload.title = String(input.title).trim();
  if (input.slug != null) payload.slug = String(input.slug).trim();
  if (input.topic != null) payload.topic = String(input.topic).trim();
  if (input.excerpt != null) payload.excerpt = String(input.excerpt).trim();
  if (input.body != null) payload.body = String(input.body);
  if (input.imageUrl != null || input.image != null) {
    payload.imageUrl = String(input.imageUrl || input.image || '').trim();
  }
  if (input.readTime != null) payload.readTime = String(input.readTime).trim();
  if (input.layout != null) payload.layout = input.layout;
  if (input.placement != null) payload.placement = input.placement;
  if (input.publishedAt != null) payload.publishedAt = input.publishedAt;
  return payload;
}

async function markPending(id, { action, payload, approverId, requestedBy }) {
  await pool.query(
    `UPDATE blogs SET
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

export async function submitBlogChange(input, { actor } = {}) {
  if (!actor?.userId) throw httpError('Please sign in.', 401);
  const approverId = await requireAdminApprover(input.approverId);
  const action = ['create', 'update', 'delete', 'move'].includes(input.action)
    ? input.action
    : 'update';
  const payload = changePayload(input.payload || input);

  if (action === 'create') {
    if (!payload.title || payload.title.length < 3) throw httpError('Please enter a title.', 400);
    if (!payload.excerpt || payload.excerpt.length < 8) {
      throw httpError('Please write a short excerpt.', 400);
    }
    if (!payload.imageUrl) throw httpError('Please add a cover image URL.', 400);
    const blog = await createBlog({ ...payload, published: false }, { actorRole: 'user' });
    await markPending(blog.id, {
      action: 'create',
      payload,
      approverId,
      requestedBy: actor.userId,
    });
    return getBlog(blog.id);
  }

  const current = await getBlog(input.blogId || input.id);
  if (!current || current.status === 'deleted') throw httpError('Blog not found.', 404);

  if (action === 'delete') {
    await markPending(current.id, {
      action: 'delete',
      payload: null,
      approverId,
      requestedBy: actor.userId,
    });
    return getBlog(current.id);
  }

  if (action === 'move') {
    const placement = payload.placement || input.placement;
    if (!PLACEMENTS.includes(placement)) throw httpError('Invalid blog section.', 400);
    await markPending(current.id, {
      action: 'move',
      payload: { placement },
      approverId,
      requestedBy: actor.userId,
    });
    return getBlog(current.id);
  }

  await markPending(current.id, {
    action: 'update',
    payload,
    approverId,
    requestedBy: actor.userId,
  });
  return getBlog(current.id);
}

export async function reviewBlogChange(id, input, { actor } = {}) {
  if (!actor?.userId) throw httpError('Please sign in.', 401);
  const current = await getBlog(id);
  if (!current) throw httpError('Blog not found.', 404);
  if (current.status === 'deleted') throw httpError('This blog is already deleted.', 400);
  if (current.approvalStatus !== 'pending') {
    throw httpError('This post is not waiting for approval.', 400);
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
      `UPDATE blogs SET
         approval_status = 'declined',
         approval_message = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [id, message]
    );
    return getBlog(id);
  }

  const action = current.pendingAction;
  const payload = current.pendingPayload || {};

  if (action === 'delete') {
    await deleteBlog(id);
    await pool.query(
      `UPDATE blogs SET
         approval_status = 'approved',
         pending_action = 'none',
         pending_payload = NULL,
         approval_message = $2,
         reviewed_at = NOW()
       WHERE id = $1`,
      [id, message]
    );
    return getBlog(id);
  }

  if (action === 'move') {
    await setBlogPlacement(id, payload.placement, { actorRole: 'admin' });
  } else if (action === 'create' || action === 'update') {
    await updateBlog(id, { ...payload, published: true, status: 'active' }, { actorRole: 'admin' });
  } else {
    await updateBlog(id, { published: true }, { actorRole: 'admin' });
  }

  await pool.query(
    `UPDATE blogs SET
       approval_status = 'approved',
       pending_action = 'none',
       pending_payload = NULL,
       published = TRUE,
       approval_message = $2,
       reviewed_at = NOW(),
       updated_at = NOW()
     WHERE id = $1 AND status = 'active'`,
    [id, message]
  );
  return getBlog(id);
}
