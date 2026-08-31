import express from 'express';
import cors from 'cors';
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
  reorderBlog,
  seedBlogsIfEmpty,
  updateBlog,
} from './blogs.js';

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pingDb();
    res.json({ ok: true, db: 'connected' });
  } catch {
    res.status(503).json({ ok: false, db: 'not connected' });
  }
});

app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await listReviews({
      project: req.query.project || undefined,
      status: req.query.status || undefined,
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

app.patch('/api/reviews/:id', async (req, res) => {
  try {
    const nextStatus = req.body.status;
    if (!['approved', 'rejected', 'pending', 'deleted'].includes(nextStatus)) {
      res.status(400).json({ message: 'Invalid status.' });
      return;
    }
    const review = await updateReviewStatus(req.params.id, nextStatus, {
      authorizerId: String(req.body.authorizerId || '').trim() || undefined,
      authorizerName: String(req.body.authorizerName || '').trim() || undefined,
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

app.delete('/api/reviews/:id', async (req, res) => {
  try {
    const review = await deleteReview(req.params.id, {
      authorizerId: String(req.body?.authorizerId || '').trim() || undefined,
      authorizerName: String(req.body?.authorizerName || '').trim() || undefined,
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

app.get('/api/blogs', async (req, res) => {
  try {
    const publishedParam = req.query.published;
    const published =
      publishedParam === 'true' ? true : publishedParam === 'false' ? false : undefined;
    const blogs = await listBlogs({ published });
    res.json({ blogs });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load blogs' });
  }
});

app.get('/api/blogs/:idOrSlug', async (req, res) => {
  try {
    const publicOnly = req.query.public !== 'false';
    const blog = await getBlog(req.params.idOrSlug, { publicOnly });
    if (!blog) {
      res.status(404).json({ message: 'Blog not found.' });
      return;
    }
    res.json({ blog });
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
  return null;
}

app.post('/api/blogs', async (req, res) => {
  try {
    const error = validateBlogPayload(req.body);
    if (error) {
      res.status(400).json({ message: error });
      return;
    }
    const blog = await createBlog(req.body);
    res.status(201).json({ blog });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not create blog' });
  }
});

app.patch('/api/blogs/:id', async (req, res) => {
  try {
    const error = validateBlogPayload(req.body, { partial: true });
    if (error) {
      res.status(400).json({ message: error });
      return;
    }
    const blog = await updateBlog(req.params.id, req.body);
    if (!blog) {
      res.status(404).json({ message: 'Blog not found.' });
      return;
    }
    res.json({ blog });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not update blog' });
  }
});

app.post('/api/blogs/:id/reorder', async (req, res) => {
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

app.delete('/api/blogs/:id', async (req, res) => {
  try {
    const ok = await deleteBlog(req.params.id);
    if (!ok) {
      res.status(404).json({ message: 'Blog not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not delete blog' });
  }
});

async function start() {
  console.log('backend starting');
  try {
    await connectDb();
    await seedBlogsIfEmpty();
  } catch (err) {
    console.error(err.message);
  }

  app.listen(PORT, () => {
    console.log('backend started');
  });
}

start();
