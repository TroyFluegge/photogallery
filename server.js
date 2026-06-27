const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app         = express();
const PORT        = process.env.PORT || 3000;
const PHOTOS_ROOT = path.resolve(__dirname, 'content');
const IMAGE_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function slugToName(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b([a-z])/g, ch => ch.toUpperCase());
}

function extractYear(slug) {
  const m = slug.match(/\b((?:19|20)\d{2})\b/);
  return m ? parseInt(m[1]) : null;
}

function slugToNameWithoutYear(slug) {
  const parts = slug.split('-').filter(p => !/^(?:19|20)\d{2}$/.test(p));
  return slugToName(parts.length ? parts.join('-') : slug);
}

function safePath(...parts) {
  const resolved = path.resolve(PHOTOS_ROOT, ...parts);
  if (!resolved.startsWith(PHOTOS_ROOT + path.sep) && resolved !== PHOTOS_ROOT) {
    return null;
  }
  return resolved;
}

function readMeta(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  } catch { return {}; }
}

function getSubdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  } catch { return []; }
}

function getImages(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort();
  } catch { return []; }
}

function findAlbumCover(albumDir, albumId) {
  for (const gallery of getSubdirs(albumDir)) {
    const images = getImages(path.join(albumDir, gallery));
    if (images.length) {
      return `/content/${albumId}/${gallery}/${images[0]}`;
    }
  }
  return null;
}

function findFirstPhotoAnywhere() {
  for (const album of getSubdirs(PHOTOS_ROOT)) {
    const cover = findAlbumCover(path.join(PHOTOS_ROOT, album), album);
    if (cover) return cover;
  }
  return null;
}

// GET /api/albums
app.get('/api/albums', (_req, res) => {
  const rootMeta = readMeta(PHOTOS_ROOT);
  const albums = getSubdirs(PHOTOS_ROOT).map(id => {
    const dir  = path.join(PHOTOS_ROOT, id);
    const meta = readMeta(dir);
    const coverPhoto = meta.coverPhoto === false
      ? false
      : meta.coverPhoto
        ? `/content/${id}/${meta.coverPhoto}`
        : findAlbumCover(dir, id);
    return {
      id,
      name:         meta.name || slugToNameWithoutYear(id),
      year:         meta.year  || extractYear(id) || null,
      coverPhoto,
      galleryCount: getSubdirs(dir).length
    };
  });
  const backgroundImage = rootMeta.backgroundImage
    ? `/content/${rootMeta.backgroundImage}`
    : findFirstPhotoAnywhere();
  res.json({
    title:           rootMeta.title    || null,
    subtitle:        rootMeta.subtitle || null,
    backgroundImage,
    albums
  });
});

// GET /api/albums/:album
app.get('/api/albums/:album', (req, res) => {
  const { album } = req.params;
  const albumDir = safePath(album);
  if (!albumDir) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(albumDir)) return res.status(404).json({ error: 'Not found' });

  const meta = readMeta(albumDir);
  const galleries = getSubdirs(albumDir).map(id => {
    const galleryDir  = path.join(albumDir, id);
    const galleryMeta = readMeta(galleryDir);
    const images = getImages(galleryDir);
    const coverPhoto = galleryMeta.coverPhoto === false
      ? false
      : galleryMeta.coverPhoto
        ? `/content/${album}/${id}/${galleryMeta.coverPhoto}`
        : images.length ? `/content/${album}/${id}/${images[0]}` : null;
    return {
      id,
      name:       galleryMeta.name || slugToName(id),
      coverPhoto,
      photoCount: images.length
    };
  });

  // When there are no gallery subfolders, serve photos directly from this album folder
  const directImages = galleries.length === 0 ? getImages(albumDir) : [];
  const photos = directImages.map(f => `/content/${album}/${f}`);

  const backgroundImage = meta.backgroundImage
    ? `/content/${album}/${meta.backgroundImage}`
    : galleries.length > 0
      ? findAlbumCover(albumDir, album)
      : photos[0] || null;
  res.json({
    name:        meta.name                        || slugToNameWithoutYear(album),
    year:        meta.year                        || extractYear(album) || null,
    description: meta.description || meta.subtitle || null,
    backgroundImage,
    galleries,
    photos
  });
});

// GET /api/albums/:album/:gallery
app.get('/api/albums/:album/:gallery', (req, res) => {
  const { album, gallery } = req.params;
  const galleryDir = safePath(album, gallery);
  if (!galleryDir) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(galleryDir)) return res.status(404).json({ error: 'Not found' });

  const meta   = readMeta(galleryDir);
  const images = getImages(galleryDir);
  const photos = images.map(f => `/content/${album}/${gallery}/${f}`);
  const backgroundImage = meta.backgroundImage
    ? `/content/${album}/${gallery}/${meta.backgroundImage}`
    : photos[0] || null;
  res.json({
    name:        meta.name                        || slugToNameWithoutYear(gallery),
    year:        meta.year                        || extractYear(gallery) || null,
    description: meta.description || meta.subtitle || null,
    backgroundImage,
    photos
  });
});

// Serve content directory — referer guard + no-store cache
app.use('/content', (req, res, next) => {
  const referer = req.headers.referer || req.headers.referrer || '';
  const host    = req.headers.host || '';
  let allowed = false;
  if (referer && host) {
    try { allowed = new URL(referer).host === host; } catch { /* malformed — deny */ }
  }
  if (!allowed) return res.status(403).send('Forbidden');
  res.setHeader('Cache-Control', 'no-store');
  next();
}, express.static(path.join(__dirname, 'content'), {
  index: false,
  dotfiles: 'deny'
}));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// SPA catch-all
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gallery running at http://localhost:${PORT}`);
});
