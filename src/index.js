import express from 'express';
import cors from 'cors';
import {
  connectDb,
  createReview,
  deleteReview,
  listReviews,
  updateReviewStatus,
} from './db.js';

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json());

app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await listReviews({
      project: req.query.project || undefined,
      status: req.query.status || undefined,
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
    const rating = Number(req.body.rating);
    const projectSlug = String(req.body.projectSlug || '').trim();
    const projectTitle = String(req.body.projectTitle || '').trim();

    if (!name || name.length < 2) {
      res.status(400).json({ message: 'Please enter your name.' });
      return;
    }
    if (!message || message.length < 8) {
      res.status(400).json({ message: 'Please write a slightly longer review.' });
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
    });
    res.status(201).json({ review });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not submit review' });
  }
});

app.patch('/api/reviews/:id', async (req, res) => {
  try {
    const nextStatus = req.body.status;
    if (!['approved', 'rejected', 'pending'].includes(nextStatus)) {
      res.status(400).json({ message: 'Invalid status.' });
      return;
    }
    const review = await updateReviewStatus(req.params.id, nextStatus);
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
    const ok = await deleteReview(req.params.id);
    if (!ok) {
      res.status(404).json({ message: 'Review not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not delete review' });
  }
});

async function start() {
  try {
    await connectDb();
    console.log('DB is connected');
  } catch (err) {
    console.log('DB is not connected');
    console.error(err.message);
  }

  app.listen(PORT, () => {
    console.log(`Shared backend running on http://localhost:${PORT}`);
  });
}

start();
