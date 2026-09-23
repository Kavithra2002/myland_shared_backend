import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import {
  connectDb,
  createReview,
  deleteReview,
  listReviews,
  pingDb,
  updateReviewStatus,
} from './db.js';
import {
  createBlog,
  deleteBlog,
  getBlog,
  listBlogs,
  migrateBlogsSchema,
  reorderBlog,
  reviewBlogChange,
  seedBlogsIfEmpty,
  setBlogPlacement,
  submitBlogChange,
  updateBlog,
} from './blogs.js';
import { optionalAuth, requireAdmin, requireAuth } from './auth.js';
import {
  authenticateUser,
  createUser,
  findActiveUserById,
  listAdmins,
  listUsers,
  migrateUsersSchema,
  seedTestUsers,
  softDeleteUser,
  updateUser,
  validateUserInput,
} from './users.js';
import { openApiSpec } from './swagger.js';
import {
  ensureUploadDirs,
  getProject,
  listProjects,
  migrateProjectsSchema,
  projectUpload,
  reviewProjectChange,
  seedWebsiteProjects,
  submitProjectChange,
  uploadsRoot,
} from './projects.js';
import {
  createLandUpdate,
  deleteLandUpdate,
  ensureLandUploadDirs,
  landUpload,
  listLandUpdates,
  migrateLandUpdatesSchema,
  updateLandUpdateStatus,
  validateLandUpdateInput,
} from './landUpdates.js';
import {
  createInquiry,
  deleteInquiry,
  getInquiry,
  isContactInquiry,
  listInquiries,
  migrateInquiriesSchema,
  updateInquiryStatus,
  validateInquiryInput,
} from './inquiries.js';
import {
  getHeartStatus,
  listHeartSummary,
  migrateFavoritesSchema,
  setHeart,
  validateHeartInput,
} from './favorites.js';
import {
  createSubscriber,
  deleteAllSubscribers,
  deleteSubscriber,
  getSubscriber,
  listSubscribers,
  markSubscriberMailed,
  migrateNewsletterSchema,
  seedTestSubscribers,
  validateSubscriberEmail,
} from './newsletter.js';
import { sendSubscriberAlert } from './mail.js';
import { notifyCrm, requireCrmKey, toCrmContact } from './crm.js';
import {
  ensureGalleryUploadDirs,
  galleryUpload,
  getAboutGallery,
  migrateAboutGallerySchema,
  reviewAboutGalleryChange,
  seedAboutGalleryIfEmpty,
  submitAboutGalleryChange,
} from './aboutGallery.js';
import {
  getSiteSettings,
  isBlogPageEnabled,
  migrateSiteSettingsSchema,
  updateSiteSettings,
} from './siteSettings.js';
import { buildSitemapXml, buildRobotsTxt } from './sitemap.js';

const app = express();
const PORT = Number(process.env.PORT || 5000);

function corsOrigin() {
  const allowed = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (!allowed.length) return true;
  return (origin, callback) => {
    if (!origin || allowed.includes(origin.replace(/\/$/, ''))) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  };
}

app.use(cors({ origin: corsOrigin() }));
app.use(express.json({ limit: '2mb' }));
ensureUploadDirs();
ensureLandUploadDirs();
ensureGalleryUploadDirs();
app.use(
  '/api/uploads',
  express.static(uploadsRoot, {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      const name = String(filePath || '').replace(/\\/g, '/').split('/').pop() || '';
      if (/^(proj|land|gallery)-\d+-/.test(name)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    },
  })
);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  explorer: true,
  customSiteTitle: 'Myland API docs',
}));
app.get('/api-docs.json', (_req, res) => {
  res.json(openApiSpec);
});

app.get('/api/health', async (_req, res) => {
  try {
    await pingDb();
    res.json({ ok: true, db: 'connected' });
  } catch {
    res.status(503).json({ ok: false, db: 'not connected' });
  }
});

async function sendSitemap(_req, res) {
  try {
    const [projects, blogPageEnabled] = await Promise.all([
      listProjects({ includeUnpublished: false }),
      isBlogPageEnabled(),
    ]);
    const blogs = blogPageEnabled ? await listBlogs({ published: true }) : [];
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buildSitemapXml({ projects, blogs, blogPageEnabled }));
  } catch (err) {
    res.status(500).type('text/plain').send('Could not build sitemap');
  }
}

app.get('/sitemap.xml', sendSitemap);
app.get('/api/sitemap.xml', sendSitemap);

app.get(['/robots.txt', '/api/robots.txt'], (_req, res) => {
  res.type('text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buildRobotsTxt());
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required.' });
      return;
    }
    const result = await authenticateUser(email, password);
    if (result.error) {
      res.status(401).json({ message: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not sign in' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const row = await findActiveUserById(req.user.userId);
    if (!row) {
      res.status(401).json({ message: 'Please sign in.' });
      return;
    }
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load session' });
  }
});

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await listUsers({ status: req.query.status || undefined });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load users' });
  }
});

app.get('/api/admins', requireAuth, async (_req, res) => {
  try {
    const admins = await listAdmins();
    res.json({ admins });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load admins' });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const error = validateUserInput(req.body, { requirePassword: true });
    if (error) {
      res.status(400).json({ message: error });
      return;
    }
    const user = await createUser(req.body, { allowRole: true });
    res.status(201).json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not create user' });
  }
});

app.patch('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ message: 'Invalid user id.' });
      return;
    }
    const error = validateUserInput(req.body, {
      partial: true,
      requirePassword: false,
    });
    if (error) {
      res.status(400).json({ message: error });
      return;
    }
    const user = await updateUser(userId, req.body);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    res.json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not update user' });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ message: 'Invalid user id.' });
      return;
    }
    if (userId === req.user.userId) {
      res.status(400).json({ message: 'You cannot delete your own account.' });
      return;
    }
    const user = await softDeleteUser(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not delete user' });
  }
});

app.get('/api/reviews', optionalAuth, async (req, res) => {
  try {
    const status = req.user ? req.query.status || undefined : 'approved';
    const reviews = await listReviews({
      project: req.query.project || undefined,
      status,
      home: req.query.home === 'true',
    });
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load reviews' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const message = String(req.body.message || '').trim();
    const rating = Math.round(Number(req.body.rating));
    const projectSlug = String(req.body.projectSlug || '').trim();
    const projectTitle = String(req.body.projectTitle || '').trim();

    if (!name || name.length < 2) {
      res.status(400).json({ message: 'Please enter your name.' });
      return;
    }
    if (!message || message.length < 5) {
      res.status(400).json({ message: 'Please write a slightly longer review (at least 5 characters).' });
      return;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ message: 'Please choose a rating from 1 to 5.' });
      return;
    }
    if (!projectSlug) {
      res.status(400).json({ message: 'Project is required.' });
      return;
    }

    const review = await createReview({
      projectSlug,
      projectTitle,
      name,
      message,
      rating,
      idempotencyKey: req.body.idempotencyKey,
    });
    res.status(201).json({ review });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not submit review' });
  }
});

app.patch('/api/reviews/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const nextStatus = req.body.status;
    if (!['approved', 'rejected', 'pending', 'deleted'].includes(nextStatus)) {
      res.status(400).json({ message: 'Invalid status.' });
      return;
    }
    const review = await updateReviewStatus(req.params.id, nextStatus, {
      authorizerId: String(req.user.userId),
      authorizerName: req.user.name,
    });
    if (!review) {
      res.status(404).json({ message: 'Review not found.' });
      return;
    }
    res.json({ review });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not update review' });
  }
});

app.delete('/api/reviews/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const review = await deleteReview(req.params.id, {
      authorizerId: String(req.user.userId),
      authorizerName: req.user.name,
    });
    if (!review) {
      res.status(404).json({ message: 'Review not found.' });
      return;
    }
    res.json({ ok: true, review });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not delete review' });
  }
});

app.get('/api/site-settings', async (_req, res) => {
  try {
    const settings = await getSiteSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load site settings' });
  }
});

app.patch('/api/site-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (typeof req.body?.blogPageEnabled !== 'boolean') {
      res.status(400).json({ message: 'blogPageEnabled must be true or false.' });
      return;
    }
    const settings = await updateSiteSettings({
      blogPageEnabled: req.body.blogPageEnabled,
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not update site settings' });
  }
});

app.get('/api/blogs', optionalAuth, async (req, res) => {
  try {
    const blogPageEnabled = await isBlogPageEnabled();
    if (!blogPageEnabled && !req.user) {
      res.json({ blogs: [], blogPageEnabled: false });
      return;
    }
    const publishedParam = req.query.published;
    let published;
    if (publishedParam === 'true') published = true;
    else if (publishedParam === 'false') published = req.user ? false : true;
    else published = req.user ? undefined : true;
    const blogs = await listBlogs({ published });
    res.json({ blogs, blogPageEnabled });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load blogs' });
  }
});

app.get('/api/blogs/:idOrSlug', optionalAuth, async (req, res) => {
  try {
    const blogPageEnabled = await isBlogPageEnabled();
    if (!blogPageEnabled && !req.user) {
      res.status(404).json({ message: 'Blog page is not available.', blogPageEnabled: false });
      return;
    }
    const publicOnly = req.query.public !== 'false';
    const blog = await getBlog(req.params.idOrSlug, { publicOnly });
    if (!blog) {
      res.status(404).json({ message: 'Blog not found.' });
      return;
    }
    res.json({ blog, blogPageEnabled });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load blog' });
  }
});

function validateBlogPayload(body, { partial = false } = {}) {
  const title = body.title != null ? String(body.title).trim() : undefined;
  const excerpt = body.excerpt != null ? String(body.excerpt).trim() : undefined;
  const imageUrl = String(body.imageUrl || body.image || '').trim();

  if (!partial || body.title != null) {
    if (!title || title.length < 3) return 'Please enter a title.';
  }
  if (!partial || body.excerpt != null) {
    if (!excerpt || excerpt.length < 8) return 'Please write a short excerpt.';
  }
  if (!partial || body.imageUrl != null || body.image != null) {
    if (!partial && !imageUrl) return 'Please add a cover image URL.';
    if ((body.imageUrl != null || body.image != null) && imageUrl && imageUrl.length < 8) {
      return 'Please add a valid image URL.';
    }
  }
  if (body.layout != null && !['auto', 'image-left', 'image-right'].includes(body.layout)) {
    return 'Invalid layout.';
  }
  if (body.placement != null && !['cover', 'features', 'index'].includes(body.placement)) {
    return 'Invalid blog section.';
  }
  return null;
}

app.post('/api/blogs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const error = validateBlogPayload(req.body);
    if (error) {
      res.status(400).json({ message: error });
      return;
    }
    const blog = await createBlog(req.body, { actorRole: req.user.role });
    res.status(201).json({ blog });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not create blog' });
  }
});

app.post('/api/blogs/submit', requireAuth, async (req, res) => {
  try {
    if (req.body?.action !== 'delete') {
      const source = req.body?.payload || req.body;
      const error = validateBlogPayload(source, {
        partial: req.body?.action === 'update' || req.body?.action === 'move',
      });
      if (error) {
        res.status(400).json({ message: error });
        return;
      }
    }
    const blog = await submitBlogChange(req.body, { actor: req.user });
    res.status(201).json({ blog });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not send for approval' });
  }
});

app.post('/api/blogs/:id/review', requireAuth, requireAdmin, async (req, res) => {
  try {
    const blog = await reviewBlogChange(req.params.id, req.body, { actor: req.user });
    res.json({ blog });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not review blog' });
  }
});

app.patch('/api/blogs/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const error = validateBlogPayload(req.body, { partial: true });
    if (error) {
      res.status(400).json({ message: error });
      return;
    }
    const blog = await updateBlog(req.params.id, req.body, { actorRole: req.user.role });
    if (!blog) {
      res.status(404).json({ message: 'Blog not found.' });
      return;
    }
    res.json({ blog });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not update blog' });
  }
});

app.post('/api/blogs/:id/reorder', requireAuth, requireAdmin, async (req, res) => {
  try {
    const direction = req.body.direction === 'down' ? 'down' : 'up';
    const blog = await reorderBlog(req.params.id, direction);
    if (!blog) {
      res.status(404).json({ message: 'Blog not found.' });
      return;
    }
    const blogs = await listBlogs();
    res.json({ blog, blogs });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not reorder blog' });
  }
});

app.post('/api/blogs/:id/place', requireAuth, requireAdmin, async (req, res) => {
  try {
    const placement = req.body.placement;
    if (!['cover', 'features', 'index'].includes(placement)) {
      res.status(400).json({ message: 'Invalid blog section.' });
      return;
    }
    const blog = await setBlogPlacement(req.params.id, placement, { actorRole: req.user.role });
    if (!blog) {
      res.status(404).json({ message: 'Blog not found.' });
      return;
    }
    const blogs = await listBlogs();
    res.json({ blog, blogs });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not move blog' });
  }
});

app.delete('/api/blogs/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const blog = await deleteBlog(req.params.id);
    if (!blog) {
      res.status(404).json({ message: 'Blog not found.' });
      return;
    }
    res.json({ ok: true, blog });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not delete blog' });
  }
});

app.get('/api/land-updates', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const status = String(req.query.status || '');
    const updates = await listLandUpdates({
      status: status || undefined,
      includeDeleted: isAdmin && (req.query.deleted === 'true' || status === 'deleted'),
    });
    res.json({ updates });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load property updates' });
  }
});

app.post('/api/land-updates', (req, res) => {
  landUpload.array('photos', 8)(req, res, async (err) => {
    if (err) {
      res.status(400).json({ message: err.message || 'Could not upload photos' });
      return;
    }
    try {
      const fields = validateLandUpdateInput(req.body || {});
      if (typeof fields === 'string') {
        res.status(400).json({ message: fields });
        return;
      }
      const update = await createLandUpdate(fields, req.files || []);
      res.status(201).json({ update });
    } catch (error) {
      res.status(500).json({ message: error.message || 'Could not send land details' });
    }
  });
});

app.patch('/api/land-updates/:id', requireAuth, async (req, res) => {
  try {
    const update = await updateLandUpdateStatus(req.params.id, String(req.body.status || ''));
    if (!update) {
      res.status(404).json({ message: 'Property update not found.' });
      return;
    }
    res.json({ update });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not update status' });
  }
});

app.delete('/api/land-updates/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const update = await deleteLandUpdate(req.params.id);
    if (!update) {
      res.status(404).json({ message: 'Property update not found.' });
      return;
    }
    res.json({ ok: true, update });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not delete property update' });
  }
});

app.get('/api/crm/contacts', requireCrmKey, async (req, res) => {
  try {
    const inquiries = await listInquiries({
      since: req.query.since || undefined,
      limit: req.query.limit || 50,
    });
    res.json({
      contacts: inquiries.map(toCrmContact),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load CRM contacts' });
  }
});

app.get('/api/inquiries', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const status = String(req.query.status || '');
    const inquiries = await listInquiries({
      status: status || undefined,
      includeDeleted: isAdmin && (req.query.deleted === 'true' || status === 'deleted'),
    });
    res.json({ inquiries });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load inquiries' });
  }
});

app.post('/api/inquiries', async (req, res) => {
  try {
    const validated = validateInquiryInput(req.body || {});
    if (validated.error) {
      res.status(400).json({ message: validated.error });
      return;
    }
    const inquiry = await createInquiry(validated.data);
    notifyCrm(inquiry).catch((err) => {
      console.warn(`crm notify skipped: ${err.message}`);
    });
    res.status(201).json({ inquiry });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not submit inquiry' });
  }
});

app.patch('/api/inquiries/:id', requireAuth, async (req, res) => {
  try {
    const inquiry = await updateInquiryStatus(req.params.id, String(req.body.status || ''));
    if (!inquiry) {
      res.status(404).json({ message: 'Inquiry not found.' });
      return;
    }
    res.json({ inquiry });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not update inquiry' });
  }
});

app.delete('/api/inquiries/:id', requireAuth, async (req, res) => {
  try {
    const existing = await getInquiry(req.params.id);
    if (!existing) {
      res.status(404).json({ message: 'Inquiry not found.' });
      return;
    }
    if (!isContactInquiry(existing) && req.user?.role !== 'admin') {
      res.status(403).json({ message: 'Admin access required.' });
      return;
    }
    const inquiry = await deleteInquiry(req.params.id);
    res.json({ ok: true, inquiry });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not delete inquiry' });
  }
});

app.get('/api/favorites/summary', requireAuth, async (_req, res) => {
  try {
    const summary = await listHeartSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load hearts' });
  }
});

app.get('/api/favorites/status', async (req, res) => {
  try {
    const status = await getHeartStatus(req.query.projectSlug, req.query.visitorKey);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load heart status' });
  }
});

app.post('/api/favorites', async (req, res) => {
  try {
    const validated = validateHeartInput(req.body || {});
    if (validated.error) {
      res.status(400).json({ message: validated.error });
      return;
    }
    const status = await setHeart(validated.data);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not update heart' });
  }
});

app.get('/api/newsletter', requireAuth, async (_req, res) => {
  try {
    const subscribers = await listSubscribers();
    res.json({ subscribers });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load subscribers' });
  }
});

app.post('/api/newsletter', async (req, res) => {
  try {
    const validated = validateSubscriberEmail(req.body || {});
    if (validated.error) {
      res.status(400).json({ message: validated.error });
      return;
    }
    const subscriber = await createSubscriber(validated.data.email);
    res.status(201).json({ subscriber });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not subscribe' });
  }
});

app.delete('/api/newsletter', requireAuth, async (_req, res) => {
  try {
    const result = await deleteAllSubscribers();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not clear emails' });
  }
});

app.delete('/api/newsletter/:id', requireAuth, async (req, res) => {
  try {
    const subscriber = await deleteSubscriber(req.params.id);
    if (!subscriber) {
      res.status(404).json({ message: 'Subscriber not found.' });
      return;
    }
    res.json({ ok: true, subscriber });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not clear email' });
  }
});

app.post('/api/newsletter/:id/send', requireAuth, async (req, res) => {
  try {
    const subscriber = await getSubscriber(req.params.id);
    if (!subscriber) {
      res.status(404).json({ message: 'Subscriber not found.' });
      return;
    }
    const subject = String(req.body.subject || 'New plots at Myland').trim();
    const message = String(req.body.message || '').trim();
    if (!subject || !message) {
      res.status(400).json({ message: 'Subject and message are required.' });
      return;
    }
    const sent = await sendSubscriberAlert(subscriber.email, { subject, message });
    const updated = sent ? await markSubscriberMailed(subscriber.id) : subscriber;
    res.json({
      sent,
      subscriber: updated,
      message: sent
        ? `Email sent to ${subscriber.email}. Check Inbox, Promotions, and Spam.`
        : 'Mail server is not configured.',
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not send email' });
  }
});

app.get('/api/gallery', optionalAuth, async (req, res) => {
  try {
    const gallery = await getAboutGallery({ includePending: Boolean(req.user) });
    res.json(gallery);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load gallery' });
  }
});

app.post('/api/gallery/uploads', requireAuth, (req, res) => {
  if (req.user?.role === 'admin') {
    res.status(403).json({ message: 'Admins approve or decline gallery requests. They cannot edit the gallery.' });
    return;
  }
  galleryUpload.array('files', 12)(req, res, (err) => {
    if (err) {
      res.status(400).json({ message: err.message || 'Could not upload photos' });
      return;
    }
    const urls = (req.files || []).map((file) => `/api/uploads/gallery/${file.filename}`);
    res.json({ urls });
  });
});

app.post('/api/gallery/submit', requireAuth, async (req, res) => {
  try {
    const gallery = await submitAboutGalleryChange(req.body, { actor: req.user });
    res.status(201).json(gallery);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not send for approval' });
  }
});

app.post('/api/gallery/review', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gallery = await reviewAboutGalleryChange(req.body, { actor: req.user });
    res.json(gallery);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not review gallery' });
  }
});

app.put('/api/gallery', requireAuth, async (req, res) => {
  const message =
    req.user?.role === 'admin'
      ? 'Admins approve or decline gallery requests. They cannot edit the gallery.'
      : 'Send gallery changes to an admin for approval.';
  res.status(403).json({ message });
});

app.get('/api/projects', optionalAuth, async (req, res) => {
  try {
    const all = req.query.all === 'true' && Boolean(req.user);
    const projects = await listProjects({
      includeUnpublished: all,
      includeDeleted: all && req.query.deleted === 'true',
    });
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load projects' });
  }
});

app.post('/api/projects/uploads', requireAuth, (req, res) => {
  if (req.user?.role === 'admin') {
    res.status(403).json({ message: 'Admins approve or decline listing requests. They cannot add or edit projects.' });
    return;
  }
  projectUpload.array('files', 12)(req, res, (err) => {
    if (err) {
      res.status(400).json({ message: err.message || 'Could not upload files' });
      return;
    }
    const urls = (req.files || []).map((file) => `/api/uploads/projects/${file.filename}`);
    res.json({ urls });
  });
});

app.post('/api/projects/submit', requireAuth, async (req, res) => {
  try {
    const project = await submitProjectChange(req.body, { actor: req.user });
    res.status(201).json({ project });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not send for approval' });
  }
});

app.post('/api/projects/:id/review', requireAuth, requireAdmin, async (req, res) => {
  try {
    const project = await reviewProjectChange(req.params.id, req.body, { actor: req.user });
    res.json({ project });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Could not review listing' });
  }
});

app.get('/api/projects/:idOrSlug', optionalAuth, async (req, res) => {
  try {
    const project = await getProject(req.params.idOrSlug, { publicOnly: !req.user });
    if (!project) {
      res.status(404).json({ message: 'Project not found.' });
      return;
    }
    res.json({ project });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load project' });
  }
});

app.post('/api/projects', requireAuth, async (req, res) => {
  const message =
    req.user?.role === 'admin'
      ? 'Admins approve or decline listing requests. They cannot add or edit projects.'
      : 'Send listing changes to an admin for approval.';
  res.status(403).json({ message });
});

app.patch('/api/projects/:id', requireAuth, async (req, res) => {
  const message =
    req.user?.role === 'admin'
      ? 'Admins approve or decline listing requests. They cannot add or edit projects.'
      : 'Send listing changes to an admin for approval.';
  res.status(403).json({ message });
});

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  const message =
    req.user?.role === 'admin'
      ? 'Admins approve or decline listing requests. They cannot add or edit projects.'
      : 'Send listing changes to an admin for approval.';
  res.status(403).json({ message });
});

async function start() {
  console.log('backend starting');
  try {
    await connectDb();
    await migrateUsersSchema();
    await seedTestUsers();
    await migrateBlogsSchema();
    await seedBlogsIfEmpty();
    await migrateProjectsSchema();
    await seedWebsiteProjects();
    await migrateLandUpdatesSchema();
    await migrateInquiriesSchema();
    await migrateFavoritesSchema();
    await migrateNewsletterSchema();
    await seedTestSubscribers();
    await migrateAboutGallerySchema();
    await seedAboutGalleryIfEmpty();
    await migrateSiteSettingsSchema();
  } catch (err) {
    console.error(err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('backend started');
    console.log(`swagger ui: http://localhost:${PORT}/api-docs`);
  });
}

start();
