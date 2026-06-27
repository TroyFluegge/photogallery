# Photo Gallery — Claude Context

This file gives Claude Code a complete picture of the project so future sessions can pick up without re-deriving architecture from scratch.

---

## Mandates

- **Never commit or push** unless the user explicitly asks.

---

## What this is

A self-hosted photo gallery website built with Node.js + Express on the backend and vanilla HTML/CSS/JS on the frontend. No build step, no framework, no database. Content is managed entirely through the filesystem.

**Navigation hierarchy:** Home (all albums) → Album (gallery list) → Gallery (photo grid + lightbox)

---

## File Map

```
photogallery/
├── server.js               Backend: API routes + static file serving
├── package.json            Single runtime dep: express ^4
├── public/
│   ├── index.html          Single HTML shell; lightbox lives here as a hidden overlay
│   ├── css/styles.css      Dark theme, card grid, thumbnail grid, lightbox, responsive
│   └── js/app.js           Hash router, API fetcher, three page renderers, lightbox logic
├── content/                All user content lives here — never committed to source control
├── README.md               End-user docs: install, photo management, deployment
└── CLAUDE.md               This file
```

---

## Architecture Decisions

### No framework, no build step
Chosen deliberately so the project has zero maintenance overhead and can be picked up years later without resolving dependency conflicts or updating toolchains. Vanilla JS is sufficient for the complexity here.

### Filesystem as the database
The server reads the directory tree on every API request (`fs.readdirSync`). There is no cache, no manifest file, no indexing step. This makes adding photos as simple as dropping files into a folder and refreshing the browser. The performance cost is negligible for a personal gallery.

### State-based client-side routing (URL never changes)
All three page views are rendered into a single `<main id="app">` element by JavaScript. Navigation uses `history.pushState(stateObj, '', '/')` — the URL is always fixed at `/`, never showing any path. The state object `{ page, albumId?, galleryId? }` is what the router reads (via `popstate` on back/forward). Cards are `<div role="link">` elements rather than `<a>` tags, with delegated click handlers that call `navigate(state)`. This means pages are not bookmarkable, but the browser back/forward buttons still work.

### Lightbox event listener lifecycle
The lightbox attaches keyboard and touch listeners on `open()` and removes them on `close()`. This is intentional — using named function references stored on the `lightbox` object (`_handleKey`, `_handleTouchStart`, `_handleTouchEnd`) so `removeEventListener` can identify and clean them up. Do not refactor these to anonymous arrow functions or the cleanup will silently break.

### Path traversal guard
`safePath()` in `server.js` resolves all user-supplied path segments and asserts the result is still under `PHOTOS_ROOT`. This must be preserved whenever the API routes are changed. Never concatenate `req.params` directly into `path.join()` calls without this check.

### Display name derivation
`slugToName(slug)` converts folder names to display names: hyphens → spaces, title-case each word. Users override this with `meta.json` files. The slug (folder name) is always the canonical identifier used in URLs and API calls; the display name is presentational only.

---

## API Surface

All endpoints are read-only. The server has no write, upload, or delete routes.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/albums` | `{ title: string\|null, subtitle: string\|null, backgroundImage: string\|null, albums: Array<{ id, name, year: number\|null, coverPhoto\|null, galleryCount }> }` |
| GET | `/api/albums/:album` | `{ name, year: number\|null, description: string\|null, backgroundImage: string\|null, galleries: Array<{ id, name, coverPhoto\|null, photoCount }>, photos: string[] }` — `photos` is populated (and `galleries` empty) when the folder contains images directly with no subfolders |
| GET | `/api/albums/:album/:gallery` | `{ name, year: number\|null, description: string\|null, backgroundImage: string\|null, photos: string[] }` |
| — | `/content/...` | Static file serving from `./content/` |
| — | `/*` | Returns `public/index.html` (SPA catch-all) |

Photo URLs are absolute-path strings served directly by Express static middleware. Album-level photos use `/content/{album}/{filename}`; gallery photos use `/content/{album}/{gallery}/{filename}`.

---

## Frontend Internals (`public/js/app.js`)

### Router
Listens on `popstate` (back/forward) and `DOMContentLoaded`. Dispatches to one of three render functions based on `event.state` (a plain object `{ page, albumId?, galleryId? }`). Navigation uses `navigate(state)` which calls `history.pushState(state, '', '/')` — the URL is always `/` and never changes. Cards are `<div role="link">` elements with delegated click handlers, not `<a>` tags. Breadcrumb links are `<span class="breadcrumb-link">` elements with click listeners.

### Render functions
- `renderHome()` — fetches `/api/albums`, sets `body.home-hero` / `#app.home-page` classes, calls `setBackground`, renders a full-viewport hero section followed by a `.gallery-section` card grid. The header is hidden via `body.home-hero`. Clearing these classes on error or when navigating away restores normal layout.
- `renderAlbum(albumId)` — removes `home-hero`/`home-page` classes, fetches `/api/albums/:album`, calls `setBackground`. If `galleries` is non-empty renders the gallery card grid; if `galleries` is empty but `photos` is non-empty renders a photo grid + lightbox directly at this level (no separate gallery step); otherwise shows empty state.
- `renderGallery(albumId, galleryId)` — removes `home-hero`/`home-page` classes, fetches album (breadcrumb) and gallery in parallel via `Promise.all`, calls `setBackground(galleryData.backgroundImage)`, renders thumbnail grid

`renderHome()` uses `title`/`subtitle` from the API response (set in `content/meta.json`), falling back to "Title" / "Description" if not set.

`setBackground(url)` fades `#page-bg` opacity to 0, swaps the `background-image` after 400ms, then fades back to 1. If `url` is null the element stays hidden.

### Lightbox
`const lightbox = { ... }` object at the bottom of `app.js`. Key behaviors:
- `lightbox.open(photos, index)` — sets state, shows overlay, pushes `{ page: 'lightbox' }` to history, attaches listeners
- `lightbox.close()` — called from × / Esc / overlay click; calls `_forceClose()` then `history.back()` to pop the lightbox history entry
- `lightbox._forceClose()` — hides overlay and removes listeners without touching history; called by `restoreState()` when back button is pressed
- `lightbox._render()` — sets `lbImg.src`, fades in, updates counter, prefetches neighbors
- Touch swipe: fires on `touchend`, requires `|dx| > 50` and `|dx| > |dy|` (horizontal intent)
- Click-to-close: only triggers when `e.target` is the backdrop or `#lb-stage`, not the image or buttons

### Back-button history contract
`currentRenderedState` tracks the last page rendered (set in `restoreState` before dispatch). When `popstate` fires with album or gallery state and the lightbox is open, `restoreState` calls `_forceClose()` and returns early — no network request, no re-render. Forward navigation into `{ page: 'lightbox' }` state is a no-op (photos array is not serialisable into history state).

---

## CSS Conventions (`public/css/styles.css`)

- CSS custom properties defined on `:root` — change colors/radii there, not inline
- Card grid uses `auto-fill, minmax(280px, 1fr)` — inherently responsive, no media query needed for column count
- Thumbnail grid uses `auto-fill, minmax(234px, 1fr)` with `aspect-ratio: 4/3` — landscape crops via `object-fit: cover`
- Lightbox z-index: `9999` for the overlay, `10001` for buttons (so they sit above the image)
- One media query at `max-width: 640px` tightens padding and shrinks minimum card/thumb widths; `#lb-stage` padding is set to `0` so the lightbox image fills the full screen on mobile (buttons are `position: fixed` so they overlay the image and don't need stage padding)
- `body.home-hero .site-header { display: none }` — header hidden on home hero; removed when navigating to inner pages
- `#app.home-page { padding: 0; max-width: none }` — overrides default app container so hero section is full-bleed
- `.hero-section` is `height: 100vh` with centered flex; `.hero-clickable` adds `cursor: pointer` and a click listener that scrolls to `#gallery-section`
- `.gallery-section` re-establishes `max-width: 1400px` padding inside the full-bleed home-page app

---

## Content Schema

### Folder structure
```
content/{album-slug}/{gallery-slug}/{image-file}
```

### Supported image extensions
`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif` (checked case-insensitively in `server.js:IMAGE_EXTS`)

### meta.json (optional, per-folder)
```json
{
  "name": "Display name (overrides folder name, year stripped automatically if omitted)",
  "description": "Second line on the hero page (overrides the year)",
  "year": 2023,
  "coverPhoto": "filename-in-same-folder.jpg",
  "backgroundImage": "filename-in-same-folder.jpg"
}
```
Setting `"coverPhoto": false` explicitly disables the cover image for that card (overrides the automatic fallback too); the card renders as text-only with extra padding. Any missing or malformed `meta.json` is silently ignored — fallback is always slug-to-name + first alphabetical image.

`content/meta.json` additionally supports `title` and `subtitle` to customize the home hero text:
```json
{
  "title": "Gallery Title",
  "subtitle": "Gallery description",
  "backgroundImage": "costa-rica-2023/snorkeling/beach.jpg"
}
```

`backgroundImage` is the full-page background photo shown behind each level:
- Home page: read from `content/meta.json`; value is a path relative to that folder (e.g. `costa-rica-2023/snorkeling/beach.jpg`); fallback is the first photo found anywhere
- Album page: filename in the album folder; fallback is first photo found in any gallery of that album
- Gallery page: filename in the gallery folder; fallback is the first photo in that gallery

### Sort order
- Albums (home page): by year descending (newest first); null-year albums last, then alphabetical within same year
- Galleries (album page): alphabetical by folder name
- Photos within a folder: alphabetical by filename
- Cover photo: first image in the sorted list, or `meta.json` `coverPhoto` if set

---

## Running Locally

```bash
npm install          # first time only
npm start            # production
npm run dev          # auto-restart on server.js changes (uses node --watch, Node 18+)
```

Default port: `3000`. Override: `PORT=8080 npm start`.

---

## Known Constraints & Non-Goals

- **No authentication.** The server is intentionally open — suited for a private home network or behind a VPN/reverse proxy. Do not expose directly to the internet without adding auth at the nginx/proxy layer.
- **No upload UI.** Photos are managed by copying files into the folder structure directly (Finder, scp, rsync, etc.).
- **No video support.** Only still image formats are recognized. Video files in the folders are silently ignored.
- **HEIC not supported.** iPhone HEIC files must be exported as JPEG before adding. The browser cannot display HEIC natively.
- **No pagination.** All photos in a folder are rendered at once. For very large sets (500+ photos), consider splitting into separate folders.
- **Flexible depth.** Albums can contain either gallery subfolders (two-level) or photos directly (one-level). Mixing files and subfolders in the same album is not supported — if any subfolders exist, direct photos are ignored.

---

## Product History

### 2026-06-26 — Hero landing page
- Home page redesigned as a full-screen hero (100vh) with large title, subtitle, and a clickable hero section that scrolls to the gallery (down-chevron button later replaced with click-anywhere)
- Site header hidden on the home hero via `body.home-hero` CSS class; restored on inner pages
- `#app.home-page` removes default padding/max-width so the hero is full-bleed; `.gallery-section` re-establishes the container for the card grid below
- `/api/albums` returns `title` and `subtitle` (from `content/meta.json`); frontend defaults to "Title" / "Description" if not set
- Clicking the hero section scrolls smoothly to `#gallery-section`

### 2026-06-26 — Security hardening for public repo
- `.gitignore` now excludes `.env`, `.env.local`, `.env.*.local`, `*.pem`
- Referer check in `server.js` tightened from `referer.includes(host)` (substring, bypassable) to `new URL(referer).host === host` (exact host:port match)
- README deployment examples updated to use generic `photo-gallery` placeholder; project folder later renamed to `photogallery`

### 2026-06-26 — Download prevention (three layers)
- **Server**: `/content` middleware checks `Referer` header matches `req.headers.host`; direct URL access returns 403. Adds `Cache-Control: no-store` on all photo responses.
- **Lightbox**: `<img id="lb-img">` replaced with `<div id="lb-img">` using CSS `background-image`. `_render()` uses a preloader `Image()` object to detect load, then sets `backgroundImage` on the div. Right-click on the lightbox view no longer offers "Save image as".
- **Thumbnails**: `draggable="false"` added to thumbnail markup; delegated `contextmenu` and `dragstart` listeners on `.photo-grid` call `e.preventDefault()`.

### 2026-06-26 — Lightbox back-button support
- `lightbox.open()` now pushes `{ page: 'lightbox' }` to history
- `lightbox.close()` split into `close()` (hides + `history.back()`) and `_forceClose()` (hides only)
- `restoreState()` gains `currentRenderedState` tracking; back button from lightbox calls `_forceClose()` and skips re-render
- Forward navigation into lightbox state is a deliberate no-op (photos can't be serialised into history)

### 2026-06-26 — Background images at every level
- `#page-bg` fixed div added to `index.html`; styled in CSS with dark overlay via `::after`
- `setBackground(url)` in `app.js` fades the background out, swaps the image, fades back in (400ms)
- Each API endpoint now returns `backgroundImage` URL (null if no photos exist)
- Fallback chain: `meta.json` `backgroundImage` → first photo at that level → null (no background)
- Home-level background reads from `content/meta.json`; value is path relative to that folder
- `findFirstPhotoAnywhere()` added to `server.js` as home-level fallback

### 2026-06-26 — URL path hidden; state-based routing
- Replaced hash router with `history.pushState(state, '', '/')` — URL always shows only domain:port
- Navigation state stored in pushState objects `{ page, albumId?, galleryId? }`; back/forward work via `popstate`
- Cards changed from `<a href>` to `<div role="link">` with delegated click handlers
- Breadcrumb links changed from `<a href>` to `<span class="breadcrumb-link">` with click handlers
- `setError` now accepts a state object instead of an href string
- Site logo in header converted from `<a>` to `<span>` with click handler (text later removed)

### 2026-06-26 — Initial build
- Created from scratch: `server.js`, `public/index.html`, `public/css/styles.css`, `public/js/app.js`, `package.json`
- Stack: Node.js + Express, vanilla HTML/CSS/JS, dark theme
- Three-level navigation: Home → Albums → Galleries
- Full lightbox with keyboard (←→Esc), touch swipe, click-outside-to-close, image prefetch
- `meta.json` support for display name and cover photo overrides
- Path traversal protection via `safePath()` in all API routes
- `README.md` added: install, photo management, deployment (PM2 / systemd / nginx), security notes

### 2026-06-26 — Flexible one- or two-level depth
- Albums can now contain photos directly (no gallery subfolder required)
- `/api/albums/:album` returns a `photos` array (populated when no gallery subfolders exist, empty otherwise)
- `renderAlbum` renders a photo grid + lightbox when `galleries` is empty and `photos` is non-empty, skipping the gallery card step entirely
- Lightbox back-button history contract works unchanged: back from lightbox returns to album page without re-fetching

### 2026-06-26 — Rename: content/album/gallery
- Root content folder renamed from `gallery/` to `content/`
- "subgallery" concept renamed to "album" throughout code, API, and docs
- "excursion" concept renamed to "gallery" throughout code, API, and docs
- API routes: `/api/subgalleries` → `/api/albums`, `:subgallery/:excursion` → `:album/:gallery`
- State objects: `{ page: 'subgallery', subId }` → `{ page: 'album', albumId }`, `{ page: 'excursion', subId, exId }` → `{ page: 'gallery', albumId, galleryId }`
- Functions: `renderSubgallery` → `renderAlbum`, `renderExcursion` → `renderGallery`, `findSubgalleryCover` → `findAlbumCover`

### 2026-06-26 — Remove site logo text
- "Gallery" text removed from `#home-logo` in `index.html`; the span remains as an invisible click target for home navigation
- README navigation section updated to remove reference to the logo

### 2026-06-26 — Click-anywhere hero navigation
- Removed `.hero-scroll-btn` down-arrow button from all four hero sections (`renderHome`, `renderAlbum` ×2, `renderGallery`)
- Hero sections now carry class `hero-clickable` (`cursor: pointer`) and a click listener that scrolls to `#gallery-section`
- `.hero-scroll-btn` CSS block removed from `styles.css`

### 2026-06-26 — Thumbnail sizing and shape
- Thumbnail min-width increased from 180px → 234px (+30%); mobile breakpoint from 100px → 130px
- Thumbnail `aspect-ratio` changed from `1` (square) to `4/3` (landscape), matching card cover ratio

### 2026-06-26 — Mobile lightbox full-screen
- `#lb-stage` padding reduced to `0` on mobile (`max-width: 640px`) so the photo fills the full viewport
- All lightbox controls (`close`, `prev`, `next`, `counter`) are `position: fixed` and overlay the image, so no stage padding is needed to clear them
