import { pool } from './db.js';

const VISITOR_KEY_RE = /^[A-Za-z0-9._:-]{8,80}$/;

export async function migrateFavoritesSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_hearts (
      id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL,
      project_title TEXT NOT NULL DEFAULT '',
      visitor_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_slug, visitor_key)
    );
    CREATE INDEX IF NOT EXISTS idx_project_hearts_slug
      ON project_hearts (project_slug);
    CREATE INDEX IF NOT EXISTS idx_project_hearts_created
      ON project_hearts (created_at DESC);
  `);
}

function cleanVisitorKey(value) {
  return String(value || '').trim();
}

export function validateHeartInput(body) {
  const projectSlug = String(body.projectSlug || '').trim();
  const projectTitle = String(body.projectTitle || '').trim();
  const visitorKey = cleanVisitorKey(body.visitorKey);
  const liked = body.liked !== false && body.liked !== 'false';

  if (!projectSlug) return { error: 'Project is required.' };
  if (!VISITOR_KEY_RE.test(visitorKey)) return { error: 'Visitor key is invalid.' };

  return {
    data: {
      projectSlug,
      projectTitle: projectTitle || projectSlug,
      visitorKey,
      liked,
    },
  };
}

export async function getHeartStatus(projectSlug, visitorKey) {
  const slug = String(projectSlug || '').trim();
  const key = cleanVisitorKey(visitorKey);
  if (!slug || !VISITOR_KEY_RE.test(key)) {
    return { liked: false, count: 0 };
  }

  const [{ rows: likedRows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT 1 FROM project_hearts WHERE project_slug = $1 AND visitor_key = $2 LIMIT 1`,
      [slug, key]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS hearts FROM project_hearts WHERE project_slug = $1`,
      [slug]
    ),
  ]);

  return {
    liked: Boolean(likedRows[0]),
    count: countRows[0]?.hearts || 0,
  };
}

export async function setHeart({ projectSlug, projectTitle, visitorKey, liked }) {
  if (liked) {
    const id = `hrt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO project_hearts (id, project_slug, project_title, visitor_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_slug, visitor_key)
       DO UPDATE SET project_title = EXCLUDED.project_title`,
      [id, projectSlug, projectTitle || projectSlug, visitorKey]
    );
  } else {
    await pool.query(
      `DELETE FROM project_hearts WHERE project_slug = $1 AND visitor_key = $2`,
      [projectSlug, visitorKey]
    );
  }
  return getHeartStatus(projectSlug, visitorKey);
}

export async function listHeartSummary() {
  const { rows } = await pool.query(`
    SELECT
      project_slug,
      MAX(project_title) AS project_title,
      COUNT(*)::int AS hearts
    FROM project_hearts
    GROUP BY project_slug
    ORDER BY hearts DESC, MAX(project_title) ASC
  `);
  const projects = rows.map((row) => ({
    slug: row.project_slug,
    title: row.project_title || row.project_slug,
    hearts: row.hearts,
  }));
  const total = projects.reduce((sum, item) => sum + item.hearts, 0);
  return { total, projects };
}
