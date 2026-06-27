// ─── API ──────────────────────────────────────────────────────────────────────

async function apiFetch(endpoint) {
  const res = await fetch('/api' + endpoint);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || `HTTP ${res.status}`), { status: res.status });
  }
  return res.json();
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

const app        = document.getElementById('app');
const breadcrumb = document.getElementById('breadcrumb');
const pageBg     = document.getElementById('page-bg');

function setBackground(url) {
  pageBg.style.opacity = '0';
  setTimeout(() => {
    pageBg.style.backgroundImage = url ? `url(${url})` : '';
    pageBg.style.opacity = url ? '1' : '0';
  }, 400);
}

function setLoading() {
  app.innerHTML = '<div class="spinner"></div>';
}

function setError(msg, backState = { page: 'home' }) {
  app.innerHTML = `
    <div class="error-state">
      <h2>Something went wrong</h2>
      <p>${msg}</p>
      <span class="breadcrumb-link">Go back</span>
    </div>`;
  app.querySelector('.breadcrumb-link')
     .addEventListener('click', () => navigate(backState));
}

function setBreadcrumb(crumbs) {
  breadcrumb.innerHTML = crumbs.map((c, i) => {
    const sep = i > 0 ? '<span class="breadcrumb-sep" aria-hidden="true"></span>' : '';
    if (c.state) {
      return `${sep}<span class="breadcrumb-link" data-state='${JSON.stringify(c.state)}'>${c.label}</span>`;
    }
    return `${sep}<span aria-current="page">${c.label}</span>`;
  }).join('');

  breadcrumb.querySelectorAll('.breadcrumb-link').forEach(el => {
    el.addEventListener('click', () => navigate(JSON.parse(el.dataset.state)));
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Router ───────────────────────────────────────────────────────────────────

let currentRenderedPath = null;

// Convert any state shape (including old album/gallery states) to a path string.
function stateToPath(state) {
  if (!state || state.page === 'home') return '';
  if (state.page === 'browse') return state.path || '';
  if (state.page === 'album')   return state.albumId || '';
  if (state.page === 'gallery') return [state.albumId, state.galleryId].filter(Boolean).join('/');
  return '';
}

window.addEventListener('popstate', e => restoreState(e.state));

window.addEventListener('DOMContentLoaded', () => {
  history.replaceState({ page: 'home' }, '', '/');
  restoreState({ page: 'home' });

  document.getElementById('home-logo').addEventListener('click', () => navigate({ page: 'home' }));
  document.getElementById('home-logo').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate({ page: 'home' }); }
  });
});

function navigate(state) {
  history.pushState(state, '', '/');
  restoreState(state);
}

function restoreState(state) {
  // Forward into a lightbox history entry can't restore photo state — do nothing.
  if (state?.page === 'lightbox') return;

  // Back button while lightbox is open → close it and stay on current page.
  if (!lightboxEl.hidden) {
    lightbox._forceClose();
    if (currentRenderedPath === stateToPath(state)) return;
  }

  const newPath = stateToPath(state);
  currentRenderedPath = newPath;
  renderBrowse(newPath ? newPath.split('/') : []);
}

// ─── Page renderer (handles any folder depth) ─────────────────────────────────

async function renderBrowse(segments) {
  const isRoot  = segments.length === 0;
  const apiPath = segments.map(encodeURIComponent).join('/');

  document.body.classList.toggle('home-hero', isRoot);
  app.classList.add('home-page');
  setLoading();

  if (isRoot) setBreadcrumb([{ label: 'Home' }]);

  try {
    const data = await apiFetch(`/browse${apiPath ? '/' + apiPath : ''}`);
    setBackground(data.backgroundImage);

    if (!isRoot) {
      const crumbs = [{ label: 'Home', state: { page: 'home' } }];
      (data.ancestors || []).slice(0, -1).forEach((anc, i) => {
        crumbs.push({
          label: anc.name,
          state: { page: 'browse', path: segments.slice(0, i + 1).join('/') }
        });
      });
      crumbs.push({ label: data.name });
      setBreadcrumb(crumbs);
    }

    const hasFolders = data.folders.length > 0;
    const hasPhotos  = data.photos?.length > 0;

    if (!isRoot && !hasFolders && !hasPhotos) {
      app.classList.remove('home-page');
      app.innerHTML = `
        <h1 class="page-title">${escapeHtml(data.name)}</h1>
        <div class="empty-state"><p>No photos found in this folder.</p></div>`;
      return;
    }

    const photoCount = data.photos?.length || 0;
    const statePath  = segments.join('/');

    let heroTitle, heroSubtitle;
    if (isRoot) {
      heroTitle    = data.title    || 'Title';
      heroSubtitle = data.subtitle || 'Description';
    } else {
      heroTitle    = data.name;
      heroSubtitle = data.description || (data.year ? String(data.year) :
        (!hasFolders && hasPhotos ? `${photoCount} photo${photoCount !== 1 ? 's' : ''}` : ''));
    }

    const foldersHtml = hasFolders ? `
      <div class="card-grid">
        ${data.folders.map(f => {
          const fPath    = statePath ? `${statePath}/${f.id}` : f.id;
          const cardMeta = f.year
            ? String(f.year)
            : f.folderCount === 0
              ? `${f.photoCount} photo${f.photoCount !== 1 ? 's' : ''}`
              : '';
          return `
            <div class="card${f.coverPhoto === false ? ' card--no-cover' : ''}" role="link" tabindex="0"
                 data-path="${fPath}">
              ${f.coverPhoto
                ? `<img class="card-cover" src="${f.coverPhoto}" alt="${escapeHtml(f.name)}" loading="lazy">`
                : f.coverPhoto === false ? ''
                : `<div class="card-cover"></div>`}
              <div class="card-info">
                <div class="card-name">${escapeHtml(f.name)}</div>
                <div class="card-meta">${cardMeta}</div>
              </div>
            </div>`;
        }).join('')}
      </div>` : '';

    const dividerHtml = hasFolders && hasPhotos
      ? `<div class="section-divider"><span>Photos</span></div>` : '';

    const photosHtml = hasPhotos ? `
      <div class="photo-grid">
        ${data.photos.map((url, i) => `
          <img
            class="photo-thumb"
            src="${url}"
            alt="Photo ${i + 1} of ${photoCount}"
            loading="lazy"
            draggable="false"
            data-index="${i}"
          >`).join('')}
      </div>` : '';

    const emptyHtml = isRoot && !hasFolders && !hasPhotos
      ? `<div class="empty-state">
           <p>No albums yet. Add folders under <code>content/</code> to get started.</p>
         </div>` : '';

    app.innerHTML = `
      <section class="hero-section ${isRoot ? '' : 'sub-hero'} hero-clickable">
        <h1 class="hero-title">${escapeHtml(heroTitle)}</h1>
        <p class="hero-subtitle">${escapeHtml(heroSubtitle)}</p>
      </section>
      <section class="gallery-section" id="gallery-section">
        ${foldersHtml}
        ${dividerHtml}
        ${photosHtml}
        ${emptyHtml}
      </section>`;

    app.querySelector('.hero-section').addEventListener('click', () => {
      document.getElementById('gallery-section').scrollIntoView({ behavior: 'smooth' });
    });

    if (hasFolders) {
      const grid = app.querySelector('.card-grid');
      grid.addEventListener('click', e => {
        const card = e.target.closest('.card[data-path]');
        if (card) navigate({ page: 'browse', path: card.dataset.path });
      });
      grid.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          const card = e.target.closest('.card[data-path]');
          if (card) { e.preventDefault(); navigate({ page: 'browse', path: card.dataset.path }); }
        }
      });
    }

    if (hasPhotos) {
      const grid = app.querySelector('.photo-grid');
      grid.addEventListener('click', e => {
        const thumb = e.target.closest('.photo-thumb');
        if (thumb) lightbox.open(data.photos, +thumb.dataset.index);
      });
      grid.addEventListener('contextmenu', e => {
        if (e.target.closest('.photo-thumb')) e.preventDefault();
      });
      grid.addEventListener('dragstart', e => {
        if (e.target.closest('.photo-thumb')) e.preventDefault();
      });
    }
  } catch (e) {
    document.body.classList.remove('home-hero');
    app.classList.remove('home-page');
    const parentPath = segments.slice(0, -1).join('/');
    setError(e.message, parentPath ? { page: 'browse', path: parentPath } : { page: 'home' });
  }
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

const lightboxEl = document.getElementById('lightbox');
const lbImg      = document.getElementById('lb-img');
const lbCounter  = document.getElementById('lb-counter');

const lightbox = {
  photos:      [],
  current:     0,
  touchStartX: 0,
  touchStartY: 0,

  open(photos, index) {
    this.photos  = photos;
    this.current = index;
    lightboxEl.hidden = false;
    document.body.style.overflow = 'hidden';
    this._render();
    history.pushState({ page: 'lightbox' }, '', '/');
    document.addEventListener('keydown',          this._handleKey);
    lightboxEl.addEventListener('touchstart',     this._handleTouchStart, { passive: true });
    lightboxEl.addEventListener('touchend',       this._handleTouchEnd,   { passive: true });
  },

  // Called from × button, Esc, and overlay click — hides and pops the
  // lightbox history entry so the browser state stays in sync.
  close() {
    this._forceClose();
    if (history.state?.page === 'lightbox') history.back();
  },

  // Called from restoreState() when the back button is pressed — hides only,
  // no history.back() since popstate already moved the pointer.
  _forceClose() {
    lightboxEl.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown',       this._handleKey);
    lightboxEl.removeEventListener('touchstart',  this._handleTouchStart);
    lightboxEl.removeEventListener('touchend',    this._handleTouchEnd);
  },

  prev() {
    this.current = (this.current - 1 + this.photos.length) % this.photos.length;
    this._render();
  },

  next() {
    this.current = (this.current + 1) % this.photos.length;
    this._render();
  },

  _render() {
    const url = this.photos[this.current];
    lbImg.style.opacity = '0';
    const loader = new Image();
    loader.onload = () => {
      lbImg.style.backgroundImage = `url(${url})`;
      lbImg.style.opacity = '1';
    };
    loader.src = url;
    lbCounter.textContent = `${this.current + 1} / ${this.photos.length}`;
    [this.current - 1, this.current + 1].forEach(i => {
      new Image().src = this.photos[(i + this.photos.length) % this.photos.length];
    });
  },

  _handleKey:        null,
  _handleTouchStart: null,
  _handleTouchEnd:   null,
};

lightbox._handleKey = e => {
  if (lightboxEl.hidden) return;
  if (e.key === 'ArrowLeft')  { e.preventDefault(); lightbox.prev(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); lightbox.next(); }
  if (e.key === 'Escape')     lightbox.close();
};

lightbox._handleTouchStart = e => {
  lightbox.touchStartX = e.touches[0].clientX;
  lightbox.touchStartY = e.touches[0].clientY;
};

lightbox._handleTouchEnd = e => {
  const dx = e.changedTouches[0].clientX - lightbox.touchStartX;
  const dy = e.changedTouches[0].clientY - lightbox.touchStartY;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    dx < 0 ? lightbox.next() : lightbox.prev();
  }
};

document.getElementById('lb-close').addEventListener('click', () => lightbox.close());
document.getElementById('lb-prev').addEventListener('click',  () => lightbox.prev());
document.getElementById('lb-next').addEventListener('click',  () => lightbox.next());

lightboxEl.addEventListener('click', e => {
  if (e.target === lightboxEl || e.target.id === 'lb-stage') {
    lightbox.close();
  }
});
