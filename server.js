const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app         = express();
const PORT        = process.env.PORT || 3000;
const PHOTOS_ROOT = path.resolve(__dirname, 'photos', 'vacations');
const IMAGE_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function slugToName(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b([a-z])/g, ch => ch.toUpperCase());
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

function findVacationCover(vacDir, vacId) {
  for (const ex of getSubdirs(vacDir)) {
    const images = getImages(path.join(vacDir, ex));
    if (images.length) {
      return `/photos/vacations/${vacId}/${ex}/${images[0]}`;
    }
  }
  return null;
}

function findFirstPhotoAnywhere() {
  for (const vac of getSubdirs(PHOTOS_ROOT)) {
    const cover = findVacationCover(path.join(PHOTOS_ROOT, vac), vac);
    if (cover) return cover;
  }
  return null;
}

// GET /api/vacations
app.get('/api/vacations', (_req, res) => {
  const rootMeta = readMeta(PHOTOS_ROOT);
  const vacations = getSubdirs(PHOTOS_ROOT).map(id => {
    const dir  = path.join(PHOTOS_ROOT, id);
    const meta = readMeta(dir);
    const coverPhoto = meta.coverPhoto
      ? `/photos/vacations/${id}/${meta.coverPhoto}`
      : findVacationCover(dir, id);
    return {
      id,
      name:          meta.name || slugToName(id),
      coverPhoto,
      excursionCount: getSubdirs(dir).length
    };
  });
  const backgroundImage = rootMeta.backgroundImage
    ? `/photos/vacations/${rootMeta.backgroundImage}`
    : findFirstPhotoAnywhere();
  res.json({ backgroundImage, vacations });
});

// GET /api/vacations/:vacation
app.get('/api/vacations/:vacation', (req, res) => {
  const { vacation } = req.params;
  const vacDir = safePath(vacation);
  if (!vacDir) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(vacDir)) return res.status(404).json({ error: 'Not found' });

  const meta = readMeta(vacDir);
  const excursions = getSubdirs(vacDir).map(id => {
    const exDir  = path.join(vacDir, id);
    const exMeta = readMeta(exDir);
    const images = getImages(exDir);
    const coverPhoto = exMeta.coverPhoto
      ? `/photos/vacations/${vacation}/${id}/${exMeta.coverPhoto}`
      : images.length ? `/photos/vacations/${vacation}/${id}/${images[0]}` : null;
    return {
      id,
      name:       exMeta.name || slugToName(id),
      coverPhoto,
      photoCount: images.length
    };
  });
  const backgroundImage = meta.backgroundImage
    ? `/photos/vacations/${vacation}/${meta.backgroundImage}`
    : findVacationCover(vacDir, vacation);
  res.json({ name: meta.name || slugToName(vacation), backgroundImage, excursions });
});

// GET /api/vacations/:vacation/:excursion
app.get('/api/vacations/:vacation/:excursion', (req, res) => {
  const { vacation, excursion } = req.params;
  const exDir = safePath(vacation, excursion);
  if (!exDir) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(exDir)) return res.status(404).json({ error: 'Not found' });

  const meta   = readMeta(exDir);
  const images = getImages(exDir);
  const photos = images.map(f => `/photos/vacations/${vacation}/${excursion}/${f}`);
  const backgroundImage = meta.backgroundImage
    ? `/photos/vacations/${vacation}/${excursion}/${meta.backgroundImage}`
    : photos[0] || null;
  res.json({ name: meta.name || slugToName(excursion), backgroundImage, photos });
});

// Serve photos directory — referer guard + no-store cache
app.use('/photos', (req, res, next) => {
  const referer = req.headers.referer || req.headers.referrer || '';
  const host    = req.headers.host || '';
  let allowed = false;
  if (referer && host) {
    try { allowed = new URL(referer).host === host; } catch { /* malformed — deny */ }
  }
  if (!allowed) return res.status(403).send('Forbidden');
  res.setHeader('Cache-Control', 'no-store');
  next();
}, express.static(path.join(__dirname, 'photos'), {
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
