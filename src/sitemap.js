const STATIC_PATHS = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/properties', changefreq: 'daily', priority: '0.9' },
  { path: '/projects', changefreq: 'daily', priority: '0.9' },
  { path: '/sell-your-land', changefreq: 'weekly', priority: '0.9' },
  { path: '/about', changefreq: 'monthly', priority: '0.8' },
  { path: '/contact', changefreq: 'monthly', priority: '0.8' },
  { path: '/faq', changefreq: 'monthly', priority: '0.7' },
  { path: '/investor-relations', changefreq: 'monthly', priority: '0.5' },
];

function siteUrl() {
  return String(process.env.PUBLIC_SITE_URL || 'https://myland.lk').replace(/\/$/, '');
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loc(path) {
  const base = siteUrl();
  if (!path || path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function lastmod(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function urlEntry({ path, changefreq, priority, updatedAt }) {
  return `  <url>
    <loc>${xmlEscape(loc(path))}</loc>
    <lastmod>${lastmod(updatedAt)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export function buildSitemapXml({ projects = [], blogs = [], blogPageEnabled = true } = {}) {
  const today = new Date().toISOString();
  const urls = STATIC_PATHS.map((item) => urlEntry({ ...item, updatedAt: today }));

  if (blogPageEnabled) {
    urls.push(urlEntry({ path: '/blog', changefreq: 'weekly', priority: '0.6', updatedAt: today }));
    blogs.forEach((blog) => {
      if (!blog?.slug) return;
      urls.push(
        urlEntry({
          path: `/blog/${blog.slug}`,
          changefreq: 'monthly',
          priority: '0.6',
          updatedAt: blog.updatedAt || blog.publishedAt || today,
        }),
      );
    });
  }

  projects.forEach((project) => {
    if (!project?.slug || project.published === false) return;
    urls.push(
      urlEntry({
        path: `/projects/${project.slug}`,
        changefreq: 'weekly',
        priority: '0.8',
        updatedAt: project.updatedAt || today,
      }),
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

export function buildRobotsTxt() {
  const base = siteUrl();
  return `User-agent: *
Allow: /
Allow: /api/uploads/

Disallow: /admin
Disallow: /api/
Disallow: /api-docs

Sitemap: ${base}/sitemap.xml
`;
}
