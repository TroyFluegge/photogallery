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

let currentRenderedState = null;

window.addEventListener('popstate', e => {
  restoreState(e.state);
});

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
  // Lightbox has its own history entry — forward-navigating into it can't
  // restore the photo state, so do nothing (user stays on current page).
  if (state?.page === 'lightbox') return;

  // Back button pressed while lightbox is open → close it and stay on the
  // current page without re-fetching.
  if (!lightboxEl.hidden) {
    lightbox._forceClose();
    if (currentRenderedState &&
        state?.page     === currentRenderedState.page &&
        state?.albumId  === currentRenderedState.albumId &&
        state?.galleryId === currentRenderedState.galleryId) return;
  }

  currentRenderedState = state;

  if (!state || state.page === 'home') {
    renderHome();
  } else if (state.page === 'album') {
    renderAlbum(state.albumId);
  } else if (state.page === 'gallery') {
    renderGallery(state.albumId, state.galleryId);
  } else {
    renderHome();
  }
}

// ─── Page: Home (hero + album cards) ──────────────────────────────────────────

async function renderHome() {
  document.body.classList.add('home-hero');
  app.classList.add('home-page');
  setLoading();
  setBreadcrumb([{ label: 'Home' }]);

  try {
    const { title, subtitle, backgroundImage, albums } = await apiFetch('/albums');
    setBackground(backgroundImage);

    const heroTitle    = title    || 'Title';
    const heroSubtitle = subtitle || 'Description';

    const albumsHtml = albums.length
      ? `<div class="card-grid">
          ${albums.map(v => `
            <div class="card${v.coverPhoto === false ? ' card--no-cover' : ''}" role="link" tabindex="0" data-album="${encodeURIComponent(v.id)}">
              ${v.coverPhoto
                ? `<img class="card-cover" src="${v.coverPhoto}" alt="${escapeHtml(v.name)}" loading="lazy">`
                : v.coverPhoto === false ? ''
                : `<div class="card-cover"></div>`}
              <div class="card-info">
                <div class="card-name">${escapeHtml(v.name)}</div>
                <div class="card-meta">${v.year || ''}</div>
              </div>
            </div>
          `).join('')}
        </div>`
      : `<div class="empty-state">
          <p>No albums yet. Add folders under <code>content/</code> to get started.</p>
        </div>`;

    app.innerHTML = `
      <section class="hero-section hero-clickable">
        <h1 class="hero-title">${escapeHtml(heroTitle)}</h1>
        <p class="hero-subtitle">${escapeHtml(heroSubtitle)}</p>
      </section>
      <section class="gallery-section" id="gallery-section">
        ${albumsHtml}
      </section>`;

    app.querySelector('.hero-section').addEventListener('click', () => {
      document.getElementById('gallery-section').scrollIntoView({ behavior: 'smooth' });
    });

    const grid = app.querySelector('.card-grid');
    if (grid) {
      grid.addEventListener('click', e => {
        const card = e.target.closest('.card[data-album]');
        if (card) navigate({ page: 'album', albumId: decodeURIComponent(card.dataset.album) });
      });
      grid.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          const card = e.target.closest('.card[data-album]');
          if (card) { e.preventDefault(); navigate({ page: 'album', albumId: decodeURIComponent(card.dataset.album) }); }
        }
      });
    }
  } catch (e) {
    document.body.classList.remove('home-hero');
    app.classList.remove('home-page');
    setError(e.message);
  }
}

// ─── Page: Album (gallery cards) ──────────────────────────────────────────────

async function renderAlbum(albumId) {
  document.body.classList.remove('home-hero');
  app.classList.add('home-page');
  setLoading();

  try {
    const data = await apiFetch(`/albums/${encodeURIComponent(albumId)}`);
    setBackground(data.backgroundImage);

    setBreadcrumb([
      { label: 'Home', state: { page: 'home' } },
      { label: data.name }
    ]);

    // No gallery subfolders — render photo grid directly if photos exist
    if (!data.galleries.length) {
      if (!data.photos?.length) {
        app.classList.remove('home-page');
        app.innerHTML = `
          <h1 class="page-title">${escapeHtml(data.name)}</h1>
          <div class="empty-state"><p>No photos found in this album folder.</p></div>`;
        return;
      }

      const photoCount = data.photos.length;
      app.innerHTML = `
        <section class="hero-section sub-hero hero-clickable">
          <h1 class="hero-title">${escapeHtml(data.name)}</h1>
          <p class="hero-subtitle">${escapeHtml(data.description || (data.year ? String(data.year) : `${photoCount} photo${photoCount !== 1 ? 's' : ''}`))}</p>
        </section>
        <section class="gallery-section" id="gallery-section">
          <div class="photo-grid">
            ${data.photos.map((url, i) => `
              <img
                class="photo-thumb"
                src="${url}"
                alt="Photo ${i + 1} of ${photoCount}"
                loading="lazy"
                draggable="false"
                data-index="${i}"
              >
            `).join('')}
          </div>
        </section>`;

      app.querySelector('.hero-section').addEventListener('click', () => {
        document.getElementById('gallery-section').scrollIntoView({ behavior: 'smooth' });
      });

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
      return;
    }

    app.innerHTML = `
      <section class="hero-section sub-hero hero-clickable">
        <h1 class="hero-title">${escapeHtml(data.name)}</h1>
        <p class="hero-subtitle">${escapeHtml(data.description || (data.year ? String(data.year) : ''))}</p>
      </section>
      <section class="gallery-section" id="gallery-section">
        <div class="card-grid">
          ${data.galleries.map(g => `
            <div class="card${g.coverPhoto === false ? ' card--no-cover' : ''}" role="link" tabindex="0"
                 data-album="${encodeURIComponent(albumId)}"
                 data-gallery="${encodeURIComponent(g.id)}">
              ${g.coverPhoto
                ? `<img class="card-cover" src="${g.coverPhoto}" alt="${escapeHtml(g.name)}" loading="lazy">`
                : g.coverPhoto === false ? ''
                : `<div class="card-cover"></div>`}
              <div class="card-info">
                <div class="card-name">${escapeHtml(g.name)}</div>
                <div class="card-meta">${g.photoCount} photo${g.photoCount !== 1 ? 's' : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>`;

    app.querySelector('.hero-section').addEventListener('click', () => {
      document.getElementById('gallery-section').scrollIntoView({ behavior: 'smooth' });
    });

    app.querySelector('.card-grid').addEventListener('click', e => {
      const card = e.target.closest('.card[data-gallery]');
      if (card) navigate({
        page:      'gallery',
        albumId:   decodeURIComponent(card.dataset.album),
        galleryId: decodeURIComponent(card.dataset.gallery)
      });
    });
    app.querySelector('.card-grid').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.card[data-gallery]');
        if (card) {
          e.preventDefault();
          navigate({
            page:      'gallery',
            albumId:   decodeURIComponent(card.dataset.album),
            galleryId: decodeURIComponent(card.dataset.gallery)
          });
        }
      }
    });
  } catch (e) {
    app.classList.remove('home-page');
    setError(e.message);
  }
}

// ─── Page: Gallery (photo grid) ───────────────────────────────────────────────

async function renderGallery(albumId, galleryId) {
  document.body.classList.remove('home-hero');
  app.classList.add('home-page');
  setLoading();

  try {
    const [albumData, galleryData] = await Promise.all([
      apiFetch(`/albums/${encodeURIComponent(albumId)}`),
      apiFetch(`/albums/${encodeURIComponent(albumId)}/${encodeURIComponent(galleryId)}`)
    ]);
    setBackground(galleryData.backgroundImage);

    setBreadcrumb([
      { label: 'Home',           state: { page: 'home' } },
      { label: albumData.name,   state: { page: 'album', albumId } },
      { label: galleryData.name }
    ]);

    if (!galleryData.photos.length) {
      app.classList.remove('home-page');
      app.innerHTML = `
        <h1 class="page-title">${escapeHtml(galleryData.name)}</h1>
        <div class="empty-state"><p>No photos found in this gallery folder.</p></div>`;
      return;
    }

    const photoCount = galleryData.photos.length;
    app.innerHTML = `
      <section class="hero-section sub-hero hero-clickable">
        <h1 class="hero-title">${escapeHtml(galleryData.name)}</h1>
        <p class="hero-subtitle">${escapeHtml(galleryData.description || (galleryData.year ? String(galleryData.year) : `${photoCount} photo${photoCount !== 1 ? 's' : ''}`))}</p>
      </section>
      <section class="gallery-section" id="gallery-section">
        <div class="photo-grid">
          ${galleryData.photos.map((url, i) => `
            <img
              class="photo-thumb"
              src="${url}"
              alt="Photo ${i + 1} of ${photoCount}"
              loading="lazy"
              draggable="false"
              data-index="${i}"
            >
          `).join('')}
        </div>
      </section>`;

    app.querySelector('.hero-section').addEventListener('click', () => {
      document.getElementById('gallery-section').scrollIntoView({ behavior: 'smooth' });
    });

    const grid = app.querySelector('.photo-grid');
    grid.addEventListener('click', e => {
      const thumb = e.target.closest('.photo-thumb');
      if (thumb) lightbox.open(galleryData.photos, +thumb.dataset.index);
    });
    grid.addEventListener('contextmenu', e => {
      if (e.target.closest('.photo-thumb')) e.preventDefault();
    });
    grid.addEventListener('dragstart', e => {
      if (e.target.closest('.photo-thumb')) e.preventDefault();
    });
  } catch (e) {
    app.classList.remove('home-page');
    setError(e.message, { page: 'album', albumId });
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
