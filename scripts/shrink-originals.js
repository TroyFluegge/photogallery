// Shrinks oversized photos in content/ in place, so the lightbox never has to
// load a multi-MB DSLR original. Run manually (`npm run shrink`) whenever a
// batch of large new photos is added. Not required before browsing — unshrunk
// originals just work at full size until this is run.
//
// Destructive by design: content/ is expected to hold working copies only,
// with real backups kept elsewhere (see CLAUDE.md).

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const PHOTOS_ROOT     = path.resolve(__dirname, '..', 'content');
const IMAGE_EXTS      = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const MAX_DISPLAY_DIM = 2560;

function walkImages(dir) {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkImages(full));
    } else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

function formatBytes(n) {
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

async function shrinkOne(file) {
  if (path.extname(file).toLowerCase() === '.gif') {
    return { skipped: true };
  }

  const before = fs.statSync(file).size;
  const meta   = await sharp(file).metadata();

  if (meta.pages && meta.pages > 1) {
    return { skipped: true }; // animated webp/avif — leave untouched
  }
  if (meta.width && meta.height && meta.width <= MAX_DISPLAY_DIM && meta.height <= MAX_DISPLAY_DIM) {
    return { skipped: true };
  }

  const tmpFile = `${file}.tmp${process.pid}`;
  await sharp(file)
    .rotate()
    .resize({ width: MAX_DISPLAY_DIM, height: MAX_DISPLAY_DIM, fit: 'inside', withoutEnlargement: true })
    .toFile(tmpFile);
  fs.renameSync(tmpFile, file);

  const after = fs.statSync(file).size;
  return { skipped: false, before, after };
}

async function main() {
  const files = walkImages(PHOTOS_ROOT);
  let resized = 0, skipped = 0, bytesBefore = 0, bytesAfter = 0;

  for (const file of files) {
    const rel = path.relative(PHOTOS_ROOT, file);
    try {
      const result = await shrinkOne(file);
      if (result.skipped) {
        skipped++;
      } else {
        resized++;
        bytesBefore += result.before;
        bytesAfter  += result.after;
        console.log(`resized  ${rel}  ${formatBytes(result.before)} -> ${formatBytes(result.after)}`);
      }
    } catch (err) {
      console.error(`failed   ${rel}  ${err.message}`);
    }
  }

  console.log('---');
  console.log(`scanned ${files.length}, resized ${resized}, skipped ${skipped}`);
  if (resized > 0) {
    console.log(`saved ${formatBytes(bytesBefore - bytesAfter)} (${formatBytes(bytesBefore)} -> ${formatBytes(bytesAfter)})`);
  }
}

main();
