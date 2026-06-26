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
  // restore the photo state, so do nothing (user stays on gallery page).
  if (state?.page === 'lightbox') return;

  // Back button pressed while lightbox is open → close it and stay on the
  // current gallery page without re-fetching.
  if (!lightboxEl.hidden) {
    lightbox._forceClose();
    if (currentRenderedState &&
        state?.page  === currentRenderedState.page &&
        state?.vacId === currentRenderedState.vacId &&
        state?.exId  === currentRenderedState.exId) return;
  }

  currentRenderedState = state;

  if (!state || state.page === 'home') {
    renderHome();
  } else if (state.page === 'vacation') {
    renderVacation(state.vacId);
  } else if (state.page === 'excursion') {
    renderExcursion(state.vacId, state.exId);
  } else {
    renderHome();
  }
}

// ─── Page: Home (vacation cards) ──────────────────────────────────────────────

async function renderHome() {
  setLoading();
  setBreadcrumb([{ label: 'Home' }]);

  try {
    const { backgroundImage, vacations } = await apiFetch('/vacations');
    setBackground(backgroundImage);

    if (!vacations.length) {
      app.innerHTML = `
        <div class="empty-state">
          <p>No vacations yet. Add folders under <code>photos/vacations/</code> to get started.</p>
        </div>`;
      return;
    }

    app.innerHTML = `
      <h1 class="page-title">Vacations</h1>
      <div class="card-grid">
        ${vacations.map(v => `
          <div class="card" role="link" tabindex="0" data-vac="${encodeURIComponent(v.id)}">
            ${v.coverPhoto
              ? `<img class="card-cover" src="${v.coverPhoto}" alt="${escapeHtml(v.name)}" loading="lazy">`
              : `<div class="card-cover"></div>`}
            <div class="card-info">
              <div class="card-name">${escapeHtml(v.name)}</div>
              <div class="card-meta">${v.excursionCount} excursion${v.excursionCount !== 1 ? 's' : ''}</div>
            </div>
          </div>
        `).join('')}
      </div>`;

    app.querySelector('.card-grid').addEventListener('click', e => {
      const card = e.target.closest('.card[data-vac]');
      if (card) navigate({ page: 'vacation', vacId: decodeURIComponent(card.dataset.vac) });
    });
    app.querySelector('.card-grid').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.card[data-vac]');
        if (card) { e.preventDefault(); navigate({ page: 'vacation', vacId: decodeURIComponent(card.dataset.vac) }); }
      }
    });
  } catch (e) {
    setError(e.message);
  }
}

// ─── Page: Vacation (excursion cards) ─────────────────────────────────────────

async function renderVacation(vacId) {
  setLoading();

  try {
    const data = await apiFetch(`/vacations/${encodeURIComponent(vacId)}`);
    setBackground(data.backgroundImage);

    setBreadcrumb([
      { label: 'Home', state: { page: 'home' } },
      { label: data.name }
    ]);

    if (!data.excursions.length) {
      app.innerHTML = `
        <h1 class="page-title">${escapeHtml(data.name)}</h1>
        <div class="empty-state"><p>No excursions found in this vacation folder.</p></div>`;
      return;
    }

    app.innerHTML = `
      <h1 class="page-title">${escapeHtml(data.name)}</h1>
      <div class="card-grid">
        ${data.excursions.map(ex => `
          <div class="card" role="link" tabindex="0"
               data-vac="${encodeURIComponent(vacId)}"
               data-ex="${encodeURIComponent(ex.id)}">
            ${ex.coverPhoto
              ? `<img class="card-cover" src="${ex.coverPhoto}" alt="${escapeHtml(ex.name)}" loading="lazy">`
              : `<div class="card-cover"></div>`}
            <div class="card-info">
              <div class="card-name">${escapeHtml(ex.name)}</div>
              <div class="card-meta">${ex.photoCount} photo${ex.photoCount !== 1 ? 's' : ''}</div>
            </div>
          </div>
        `).join('')}
      </div>`;

    app.querySelector('.card-grid').addEventListener('click', e => {
      const card = e.target.closest('.card[data-ex]');
      if (card) navigate({
        page:  'excursion',
        vacId: decodeURIComponent(card.dataset.vac),
        exId:  decodeURIComponent(card.dataset.ex)
      });
    });
    app.querySelector('.card-grid').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.card[data-ex]');
        if (card) {
          e.preventDefault();
          navigate({
            page:  'excursion',
            vacId: decodeURIComponent(card.dataset.vac),
            exId:  decodeURIComponent(card.dataset.ex)
          });
        }
      }
    });
  } catch (e) {
    setError(e.message);
  }
}

// ─── Page: Excursion (photo grid) ─────────────────────────────────────────────

async function renderExcursion(vacId, exId) {
  setLoading();

  try {
    const [vacData, exData] = await Promise.all([
      apiFetch(`/vacations/${encodeURIComponent(vacId)}`),
      apiFetch(`/vacations/${encodeURIComponent(vacId)}/${encodeURIComponent(exId)}`)
    ]);
    setBackground(exData.backgroundImage);

    setBreadcrumb([
      { label: 'Home',       state: { page: 'home' } },
      { label: vacData.name, state: { page: 'vacation', vacId } },
      { label: exData.name }
    ]);

    if (!exData.photos.length) {
      app.innerHTML = `
        <h1 class="page-title">${escapeHtml(exData.name)}</h1>
        <div class="empty-state"><p>No photos found in this excursion folder.</p></div>`;
      return;
    }

    app.innerHTML = `
      <h1 class="page-title">${escapeHtml(exData.name)}</h1>
      <div class="photo-grid">
        ${exData.photos.map((url, i) => `
          <img
            class="photo-thumb"
            src="${url}"
            alt="Photo ${i + 1} of ${exData.photos.length}"
            loading="lazy"
            draggable="false"
            data-index="${i}"
          >
        `).join('')}
      </div>`;

    const grid = app.querySelector('.photo-grid');
    grid.addEventListener('click', e => {
      const thumb = e.target.closest('.photo-thumb');
      if (thumb) lightbox.open(exData.photos, +thumb.dataset.index);
    });
    grid.addEventListener('contextmenu', e => {
      if (e.target.closest('.photo-thumb')) e.preventDefault();
    });
    grid.addEventListener('dragstart', e => {
      if (e.target.closest('.photo-thumb')) e.preventDefault();
    });
  } catch (e) {
    setError(e.message, { page: 'vacation', vacId });
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
