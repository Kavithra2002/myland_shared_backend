import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { WEBSITE_PROJECTS } from './websiteProjects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_IMAGES = path.resolve(__dirname, '../../client/src/images');
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
const projectUploadsDir = path.join(uploadsRoot, 'projects');

const MEDIA_BY_SLUG = {
  balummahara: { dir: 'new/avilable/Balummahara', cover: '6.png' },
  'field-breeze-divulapitiya': { dir: 'new/avilable/Divulapitiya', cover: 'Divulapitiya_03.jpg' },
  'kirindivela-serenity-park': {
    dir: 'new/avilable/Kirindivela',
    cover: 'DRONE.00_09_36_07.Still005.jpg',
  },
  meerigama: { dir: 'new/avilable/Meerigama', cover: 'WhatsApp Image 2025-08-29 at 11.17.35.jpeg' },
  dompe: { dir: 'new/sold out/Dompe', cover: '20180908_081321.jpg' },
  kiribathgoda: { dir: 'new/sold out/Kiribathgoda', cover: '20180519_103039.jpg' },
};

function publicUrl(destFile) {
  const relative = path.relative(uploadsRoot, destFile).replace(/\\/g, '/');
  return `/api/uploads/${relative}`;
}

function listFolderImages(relativeDir) {
  const dir = path.join(CLIENT_IMAGES, relativeDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(jpe?g|png|webp|gif)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((name) => path.posix.join(relativeDir.replace(/\\/g, '/'), name));
}

function copyClientImage(relativeFrom, destFile) {
  const from = path.join(CLIENT_IMAGES, relativeFrom);
  if (!fs.existsSync(from)) return '';
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.copyFileSync(from, destFile);
  return publicUrl(destFile);
}

function destFor(slug, name, sourceRel) {
  const ext = path.extname(sourceRel || '').toLowerCase() || '.jpg';
  return path.join(projectUploadsDir, 'website', slug, `${name}${ext}`);
}

function mediaForSlug(slug) {
  const spec = MEDIA_BY_SLUG[slug];
  if (!spec) return { imageUrl: '', gallery: [], plotPlan: null };
  const files = listFolderImages(spec.dir);
  const coverRel = files.find((rel) => rel.endsWith(`/${spec.cover}`)) || files[0];
  if (!coverRel) return { imageUrl: '', gallery: [], plotPlan: null };
  const imageUrl = copyClientImage(coverRel, destFor(slug, 'cover', coverRel));
  const extras = files
    .filter((rel) => rel !== coverRel)
    .map((rel, index) => copyClientImage(rel, destFor(slug, `gallery-${index + 1}`, rel)))
    .filter(Boolean);
  return {
    imageUrl: imageUrl || extras[0] || '',
    gallery: [...new Set([imageUrl, ...extras].filter(Boolean))],
    plotPlan: null,
  };
}

export async function syncWebsiteProjectMedia() {
  if (!fs.existsSync(CLIENT_IMAGES)) return;
  fs.mkdirSync(path.join(projectUploadsDir, 'website'), { recursive: true });
  let updated = 0;
  for (const item of WEBSITE_PROJECTS) {
    const media = mediaForSlug(item.slug);
    if (!media.imageUrl && !media.gallery.length) continue;
    const { rowCount } = await pool.query(
      `UPDATE projects
          SET image_url = $2,
              gallery = $3::jsonb,
              plot_plan_url = CASE
                WHEN plot_plan_url LIKE '/api/uploads/projects/website/%' OR COALESCE(plot_plan_url, '') = '' THEN $4
                ELSE plot_plan_url
              END
        WHERE slug = $1
          AND (
            COALESCE(image_url, '') = ''
            OR image_url LIKE '/api/uploads/projects/website/%'
          )`,
      [item.slug, media.imageUrl, JSON.stringify(media.gallery), media.plotPlan]
    );
    updated += rowCount;
  }
  if (updated) console.log(`filled website project photos for ${updated} listings`);
}
