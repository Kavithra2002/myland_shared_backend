import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { WEBSITE_PROJECTS } from './websiteProjects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_IMAGES = path.resolve(__dirname, '../../client/src/images');
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
const projectUploadsDir = path.join(uploadsRoot, 'projects');

const DEFAULT_COVER = 'previous/myland_Balummahara (1)/6.png';
const DEFAULT_GALLERY = [
  'previous/myland_Balummahara (1)/6.png',
  'previous/myland_Balummahara (1)/1.png',
  'previous/myland_Balummahara (1)/2.png',
  'previous/myland_Balummahara (1)/3.png',
  'previous/myland_Balummahara (1)/4.png',
  'previous/myland_Balummahara (1)/5.png',
  'previous/myland_Balummahara (1)/7.png',
  'previous/myland_Balummahara (1)/8.png',
];
const DEFAULT_PLOT = 'previous/WhatsApp Image 2026-08-12 at 3.55.34 PM.jpeg';

const MEDIA_BY_SLUG = {
  'field-breeze-divulapitiya': {
    cover: 'divlapitiya/house design for home page.jpg',
    gallery: [
      'divlapitiya/house design for home page.jpg',
      'divlapitiya/WhatsApp Image 2026-09-10 at 3.43.42 PM.jpeg',
      'divlapitiya/WhatsApp Image 2026-09-10 at 3.43.43 PM.jpeg',
      'divlapitiya/WhatsApp Image 2026-09-10 at 3.43.47 PM.jpeg',
      'divlapitiya/WhatsApp Image 2026-09-10 at 3.43.45 PM.jpeg',
      'divlapitiya/WhatsApp Image 2026-09-10 at 3.43.46 PM.jpeg',
      'divlapitiya/WhatsApp Image 2026-09-10 at 3.43.44 PM.jpeg',
    ],
    plot: null,
  },
  'kirindivela-serenity-park': {
    cover: 'kirindivela/WhatsApp Image 2026-09-14 at 4.04.54 PM (1).jpeg',
    gallery: [
      'kirindivela/WhatsApp Image 2026-09-14 at 4.04.54 PM (1).jpeg',
      'kirindivela/WhatsApp Image 2026-09-14 at 4.04.54 PM.jpeg',
      'kirindivela/WhatsApp Image 2026-09-14 at 4.04.54 PM (2).jpeg',
      'kirindivela/WhatsApp Image 2026-09-14 at 4.04.54 PM (3).jpeg',
      'kirindivela/WhatsApp Image 2026-09-14 at 4.04.54 PM (4).jpeg',
      'kirindivela/WhatsApp Image 2026-09-14 at 4.04.54 PM (5).jpeg',
      'kirindivela/WhatsApp Image 2026-09-14 at 4.04.54 PM (6).jpeg',
      'kirindivela/WhatsApp Image 2026-09-14 at 4.04.54 PM (7).jpeg',
    ],
    plot: null,
  },
};

function publicUrl(destFile) {
  const relative = path.relative(uploadsRoot, destFile).replace(/\\/g, '/');
  return `/api/uploads/${relative}`;
}

function copyClientImage(relativeFrom, destFile) {
  const from = path.join(CLIENT_IMAGES, relativeFrom);
  if (!fs.existsSync(from)) return '';
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  if (!fs.existsSync(destFile)) fs.copyFileSync(from, destFile);
  return publicUrl(destFile);
}

function destFor(slug, name, sourceRel) {
  const ext = path.extname(sourceRel || '').toLowerCase() || '.jpg';
  return path.join(projectUploadsDir, 'website', slug, `${name}${ext}`);
}

function mediaForSlug(slug) {
  const spec = MEDIA_BY_SLUG[slug] || {
    cover: DEFAULT_COVER,
    gallery: DEFAULT_GALLERY,
    plot: DEFAULT_PLOT,
  };
  const imageUrl = copyClientImage(spec.cover, destFor(slug, 'cover', spec.cover));
  const extras = (spec.gallery || [])
    .filter((rel) => rel !== spec.cover)
    .map((rel, index) => copyClientImage(rel, destFor(slug, `gallery-${index + 1}`, rel)))
    .filter(Boolean);
  const photos = [...new Set([imageUrl, ...extras].filter(Boolean))];
  const plotPlan = spec.plot ? copyClientImage(spec.plot, destFor(slug, 'plot', spec.plot)) : '';
  return {
    imageUrl: imageUrl || photos[0] || '',
    gallery: photos,
    plotPlan: plotPlan || null,
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
