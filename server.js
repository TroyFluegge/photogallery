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

// Recursively finds the first photo URL under dir, building the content URL with urlPath prefix.
function findCoverAnywhere(dir, urlPath) {
  const img = getImages(dir)[0];
  if (img) return `/content/${urlPath ? urlPath + '/' : ''}${img}`;
  for (const sub of getSubdirs(dir)) {
    const subPath = urlPath ? `${urlPath}/${sub}` : sub;
    const found   = findCoverAnywhere(path.join(dir, sub), subPath);
    if (found) return found;
  }
  return null;
}

// Generic handler for any folder depth under content/.
function handleBrowse(urlPath, res) {
  const segments  = urlPath ? urlPath.split('/').filter(Boolean) : [];
  const targetDir = segments.length ? safePath(...segments) : PHOTOS_ROOT;
  if (!targetDir) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(targetDir)) return res.status(404).json({ error: 'Not found' });

  const meta   = readMeta(targetDir);
  const isRoot = segments.length === 0;
  const prefix = urlPath ? urlPath + '/' : '';

  let folders = getSubdirs(targetDir).map(id => {
    const dir    = path.join(targetDir, id);
    const fm     = readMeta(dir);
    const subUrl = `${prefix}${id}`;
    const direct = getImages(dir)[0];
    const coverPhoto = fm.coverPhoto === false
      ? false
      : fm.coverPhoto
        ? `/content/${subUrl}/${fm.coverPhoto}`
        : direct
          ? `/content/${subUrl}/${direct}`
          : findCoverAnywhere(dir, subUrl);
    return {
      id,
      name:        fm.name || slugToNameWithoutYear(id),
      year:        fm.year  || extractYear(id) || null,
      coverPhoto,
      folderCount: getSubdirs(dir).length,
      photoCount:  getImages(dir).length
    };
  });

  // Root level sorted newest-first by year; all other levels stay alphabetical.
  if (isRoot) {
    folders.sort((a, b) => {
      if (a.year === b.year) return a.name.localeCompare(b.name);
      if (a.year === null)   return 1;
      if (b.year === null)   return -1;
      return b.year - a.year;
    });
  }

  const photos = getImages(targetDir).map(f => `/content/${prefix}${f}`);

  const backgroundImage = meta.backgroundImage
    ? `/content/${prefix}${meta.backgroundImage}`
    : findCoverAnywhere(targetDir, urlPath || '');

  // Ancestor names so the frontend can build breadcrumbs without extra fetches.
  const ancestors = segments.map((seg, i) => {
    const dir = safePath(...segments.slice(0, i + 1));
    const m   = dir ? readMeta(dir) : {};
    return { slug: seg, name: m.name || slugToNameWithoutYear(seg) };
  });

  const lastName = segments[segments.length - 1];
  res.json({
    ...(isRoot ? { title: meta.title || null, subtitle: meta.subtitle || null } : {}),
    name:        meta.name        || (lastName ? slugToNameWithoutYear(lastName) : null),
    year:        meta.year        || (lastName ? extractYear(lastName) || null   : null),
    description: meta.description || null,
    backgroundImage,
    ancestors,
    folders,
    photos
  });
}

// Browse API — handles any folder depth under content/
app.get('/api/browse',   (_req, res) => handleBrowse('', res));
app.get('/api/browse/*', (req, res)  => handleBrowse(req.params[0], res));

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
