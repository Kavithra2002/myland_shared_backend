import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { uploadsRoot } from './projects.js';

const MAX_BYTES = 12 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9_-]{10,}$/;

export const blogUploadsDir = path.join(uploadsRoot, 'blogs');

export function ensureBlogUploadDir() {
  fs.mkdirSync(blogUploadsDir, { recursive: true });
}

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function isGoogleHost(hostname) {
  const host = String(hostname || '').replace(/^www\./, '').toLowerCase();
  return (
    host === 'drive.google.com' ||
    host === 'docs.google.com' ||
    host === 'drive.usercontent.google.com' ||
    host.endsWith('.googleusercontent.com') ||
    host.endsWith('.google.com') ||
    host.endsWith('.gstatic.com')
  );
}

export function googleDriveFileId(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const allowed =
    host === 'drive.google.com' ||
    host === 'docs.google.com' ||
    host === 'drive.usercontent.google.com' ||
    host.endsWith('googleusercontent.com');
  if (!allowed) return '';

  const fromPath = url.pathname.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (fromPath && ID_PATTERN.test(fromPath[1])) return fromPath[1];
  const fromQuery = url.searchParams.get('id') || '';
  if (ID_PATTERN.test(fromQuery)) return fromQuery;
  return '';
}

export function directDriveImageUrl(input) {
  const id = googleDriveFileId(input);
  if (!id) return String(input || '').trim();
  return `https://lh3.googleusercontent.com/d/${id}`;
}

function isDirectDriveImage(input) {
  const value = String(input || '').trim();
  try {
    const url = new URL(value);
    return (
      url.hostname.replace(/^www\./, '') === 'lh3.googleusercontent.com' &&
      /^\/d\/[a-zA-Z0-9_-]{10,}/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function displayImageUrl(input) {
  const value = String(input || '').trim();
  if (!value || value.startsWith('/api/uploads/')) return value;
  if (!googleDriveFileId(value)) return value;
  return directDriveImageUrl(value);
}

function candidateUrls(id) {
  return [
    `https://lh3.googleusercontent.com/d/${id}`,
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`,
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=view&confirm=t`,
  ];
}

function extFromType(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('png')) return '.png';
  if (value.includes('webp')) return '.webp';
  if (value.includes('gif')) return '.gif';
  return '.jpg';
}

function sniffImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return '.png';
  }
  if (bytes.length >= 6 && bytes.slice(0, 3).toString() === 'GIF') return '.gif';
  if (bytes.length >= 12 && bytes.slice(0, 4).toString() === 'RIFF' && bytes.slice(8, 12).toString() === 'WEBP') {
    return '.webp';
  }
  return '';
}

async function fetchGoogle(target, hops = 0) {
  if (hops > 4) throw httpError('Google Drive sent too many redirects.');
  const current = new URL(target);
  if (!isGoogleHost(current.hostname)) {
    throw httpError('That link is not a Google Drive image.');
  }
  const res = await fetch(current, {
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (!location) throw httpError('Google Drive redirected without a destination.');
    return fetchGoogle(new URL(location, current).toString(), hops + 1);
  }
  return res;
}

async function readLimited(res) {
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) {
    throw httpError('That image is larger than 12 MB. Choose a smaller file.');
  }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw httpError('That image is larger than 12 MB. Choose a smaller file.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function importDriveImage(id) {
  ensureBlogUploadDir();
  for (const target of candidateUrls(id)) {
    try {
      const res = await fetchGoogle(target);
      if (!res.ok) continue;
      const type = String(res.headers.get('content-type') || '').toLowerCase();
      if (type.includes('text/html') || type.includes('application/json')) continue;
      const bytes = await readLimited(res);
      const sniffed = sniffImage(bytes);
      if (!type.startsWith('image/') && !sniffed) continue;
      if (bytes.length < 32) continue;
      const ext = sniffed || extFromType(type);
      const filename = `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      fs.writeFileSync(path.join(blogUploadsDir, filename), bytes);
      return `/api/uploads/blogs/${filename}`;
    } catch (err) {
      if (err.statusCode === 400 && /larger than/i.test(err.message)) throw err;
    }
  }
  return '';
}

export async function resolveStoredImageUrl(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  if (value.startsWith('/api/uploads/')) return value;
  if (value.startsWith('blob:') || value.startsWith('data:')) {
    throw httpError('Upload the image file instead of a temporary preview.');
  }
  if (isDirectDriveImage(value)) return directDriveImageUrl(value);
  const id = googleDriveFileId(value);
  if (id) {
    const copied = await importDriveImage(id);
    return copied || directDriveImageUrl(value);
  }
  if (/^https?:\/\//i.test(value)) return value;
  throw httpError('Please add an image file or a direct image URL.');
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureBlogUploadDir();
    cb(null, blogUploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const safe = allowed.includes(ext) ? (ext === '.jpeg' ? '.jpg' : ext) : '.jpg';
    cb(null, `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safe}`);
  },
});

export const blogUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const type = String(file.mimetype || '').toLowerCase();
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) {
      cb(null, true);
      return;
    }
    cb(new Error('Please upload a JPG, PNG, WEBP, or GIF image.'));
  },
});

export function uploadErrorMessage(err) {
  if (err?.code === 'LIMIT_FILE_SIZE') return 'That image is larger than 12 MB. Choose a smaller file.';
  return err?.message || 'Could not upload image';
}
