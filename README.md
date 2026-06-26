# Photo Gallery

A self-hosted vacation photo gallery. Navigate from a home page through vacation destinations down to individual excursions, where photos are displayed in a grid with a full-screen lightbox viewer. New content is added by dropping folders and images onto the filesystem — no code changes or server restarts required.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Running the Server](#running-the-server)
- [Photo Management](#photo-management)
  - [Folder Structure](#folder-structure)
  - [Naming Conventions](#naming-conventions)
  - [Supported Image Formats](#supported-image-formats)
  - [Display Order](#display-order)
  - [Cover Photos](#cover-photos)
  - [Background Images](#background-images)
  - [Custom Display Names and Overrides (meta.json)](#custom-display-names-and-overrides-metajson)
- [Navigation](#navigation)
- [Lightbox Controls](#lightbox-controls)
- [Configuration](#configuration)
- [Deployment Notes](#deployment-notes)
- [Security](#security)

---

## Requirements

- **Node.js** v18 or later (v26 recommended; uses `node --watch` for development)
- **npm** v8 or later (included with Node.js)

No database, no build step, no other runtime dependencies beyond Express.

---

## Installation

```bash
# Clone or download the project, then enter the directory
cd photo-gallery

# Install the single runtime dependency (Express)
npm install
```

---

## Running the Server

**Production / normal use:**
```bash
npm start
```

**Development (auto-restarts when server.js changes):**
```bash
npm run dev
```

The server starts on port **3000** by default. Open your browser to:

```
http://localhost:3000
```

To use a different port, set the `PORT` environment variable before starting:

```bash
PORT=8080 npm start
```

---

## Photo Management

### Folder Structure

All photos live under `photos/vacations/`. Each vacation is a subfolder; each excursion is a subfolder inside the vacation. Photos go directly inside excursion folders.

```
photos/
└── vacations/
    ├── costa-rica-2023/
    │   ├── meta.json              ← optional, see below
    │   ├── snorkeling/
    │   │   ├── meta.json          ← optional
    │   │   ├── IMG_001.jpg
    │   │   ├── IMG_002.jpg
    │   │   └── IMG_003.jpg
    │   └── zip-lining/
    │       ├── action-shot.jpg
    │       └── group-photo.png
    └── italy-2025/
        ├── rome/
        │   └── colosseum.jpg
        └── amalfi-coast/
            └── sunset.webp
```

**Adding a new vacation** — create a folder and add at least one excursion subfolder with photos:

```bash
mkdir -p photos/vacations/japan-2026/tokyo-day-1
# copy photos into that folder
```

Refresh the browser. The new vacation appears on the home page immediately — no server restart needed.

**Adding a new excursion to an existing vacation:**

```bash
mkdir photos/vacations/costa-rica-2023/waterfall-hike
# copy photos in
```

**Adding more photos to an existing excursion:**

```bash
cp ~/Downloads/new-photos/*.jpg photos/vacations/costa-rica-2023/snorkeling/
```

Again, just refresh — the server reads the filesystem on every request.

---

### Naming Conventions

Folder names become display names automatically. Hyphens are converted to spaces and each word is title-cased:

| Folder name | Display name |
|---|---|
| `costa-rica-2023` | `Costa Rica 2023` |
| `snorkeling` | `Snorkeling` |
| `zip-lining-at-arenal` | `Zip Lining At Arenal` |
| `day-1` | `Day 1` |

For names that need custom capitalization (e.g., `USA`, `NYC`) or a completely different label, use a `meta.json` file — see [Custom Display Names](#custom-display-names-metajson).

**Recommendations:**
- Use lowercase letters, numbers, and hyphens only
- Avoid spaces, underscores, apostrophes, or special characters in folder names
- Use a year suffix on vacation folders to distinguish repeat destinations: `paris-2019`, `paris-2024`

---

### Supported Image Formats

The server recognizes these extensions (case-insensitive):

| Extension | Format |
|---|---|
| `.jpg` / `.jpeg` | JPEG |
| `.png` | PNG |
| `.webp` | WebP |
| `.gif` | GIF |
| `.avif` | AVIF |

Files with any other extension (`.raw`, `.heic`, `.mov`, `.txt`, etc.) are ignored by the API and never listed in the gallery, though they can coexist in the same folder.

> **Tip:** For best web performance, convert phone photos to JPEG or WebP before adding them. HEIC files from iPhones are not displayed — export as JPEG from Photos.app or use a converter.

---

### Display Order

Within any excursion, photos are displayed in **alphabetical order by filename**. The simplest way to control order is to prefix filenames with a number:

```
01-arrival.jpg
02-hotel.jpg
03-beach.jpg
```

Camera-generated names like `IMG_4521.jpg` sort correctly as long as the numbering is consistent within a trip. If photos from multiple devices are mixed, renaming with a date-time prefix works well:

```
2023-03-15-08-30-snorkel-reef.jpg
2023-03-15-10-45-sea-turtle.jpg
```

Vacations and excursions are also listed in **alphabetical order by folder name**. Prefix folder names with a number or date to control the order on the home and vacation pages:

```
photos/vacations/
├── 01-costa-rica-2023/
└── 02-italy-2025/
```

---

### Cover Photos

The image shown on vacation and excursion cards is chosen automatically: the **first alphabetical image file** in the folder. For excursion cards, this is the first photo in that excursion's folder. For vacation cards, the server walks excursion subfolders (alphabetically) and uses the first photo it finds.

To set a specific cover photo, use `meta.json` — see below.

---

### Background Images

Each page level displays a full-bleed background image behind the content, with a dark overlay to keep text readable. The background changes as you navigate, with a smooth fade transition.

The background at each level is chosen automatically — no configuration required:

| Level | Automatic fallback |
|---|---|
| Home page | First photo found anywhere in `photos/vacations/` |
| Vacation page | First photo found in any excursion of that vacation |
| Excursion page | First photo in that excursion |

To use a specific image instead of the automatic one, set `backgroundImage` in `meta.json` — see below.

---

### Custom Display Names and Overrides (meta.json)

Place an optional `meta.json` file inside any folder to override the automatic display name, cover photo, and/or background image. All fields are optional — omit any you don't need.

**Schema:**

```json
{
  "name": "Human-readable display name",
  "coverPhoto": "filename-in-this-folder.jpg",
  "backgroundImage": "filename-in-this-folder.jpg"
}
```

**Example — vacation folder:**

```
photos/vacations/cr-2023/meta.json
```

```json
{
  "name": "Costa Rica 2023",
  "coverPhoto": "beach-sunset.jpg",
  "backgroundImage": "jungle-canopy.jpg"
}
```

**Example — excursion folder:**

```
photos/vacations/cr-2023/snorkeling/meta.json
```

```json
{
  "name": "Snorkeling at Playa Conchal",
  "coverPhoto": "sea-turtle-close.jpg",
  "backgroundImage": "coral-reef-wide.jpg"
}
```

**Home page background** — to pin a specific background on the home page, create `photos/vacations/meta.json`. The `backgroundImage` value here is a path relative to the `vacations/` folder (since the home page has no photos of its own):

```
photos/vacations/meta.json
```

```json
{
  "backgroundImage": "costa-rica-2023/snorkeling/coral-reef-wide.jpg"
}
```

All filenames must exist in the same folder as the `meta.json` (except the home-level path above). If a file is missing or the JSON is malformed, the server silently falls back to automatic behavior.

---

## Navigation

The URL bar always shows only `http://localhost:3000/` regardless of which page you are on. Navigation state is tracked in the browser session only — pages are not bookmarkable or shareable by URL.

The browser **Back** and **Forward** buttons work normally. A breadcrumb trail in the header (`Home / Costa Rica 2023 / Snorkeling`) is always clickable for quick backwards navigation. The **Gallery** logo in the top-left always returns to the home page.

---

## Lightbox Controls

Clicking any thumbnail opens the full-screen lightbox viewer.

| Action | Control |
|---|---|
| Next photo | `→` arrow key, click `›` button, or swipe left |
| Previous photo | `←` arrow key, click `‹` button, or swipe right |
| Close | `Esc` key, click `×` button, or click the dark background |
| Photo counter | Displayed at the bottom: `3 / 17` |

The lightbox wraps around — pressing next on the last photo goes back to the first. Adjacent images are prefetched in the background so navigation feels instant.

The browser **Back** button closes the lightbox and returns to the excursion gallery. **Forward** after that stays on the gallery (the lightbox cannot be restored from browser history).

---

## Configuration

All configuration is done via environment variables. There is no config file.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the HTTP server listens on |

Example:

```bash
PORT=8080 npm start
```

If you need to change the location of the `photos/` directory, edit the `PHOTOS_ROOT` constant on line 7 of `server.js`:

```js
const PHOTOS_ROOT = path.resolve(__dirname, 'photos', 'vacations');
```

---

## Deployment Notes

The server is a plain Node.js process. Common ways to keep it running persistently on a home server or VPS:

**Using PM2:**

```bash
npm install -g pm2
pm2 start server.js --name gallery
pm2 save
pm2 startup   # follow the printed command to enable auto-start on boot
```

**Using a systemd service** (Linux):

Create `/etc/systemd/system/gallery.service`:

```ini
[Unit]
Description=Photo Gallery
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/photo-gallery/server.js
WorkingDirectory=/path/to/photo-gallery
Restart=always
Environment=PORT=3000
User=youruser

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable gallery
sudo systemctl start gallery
```

**Reverse proxy with nginx** (to serve on port 80/443):

```nginx
server {
    listen 80;
    server_name gallery.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Serve photos directly for better performance (optional)
    location /photos/ {
        alias /path/to/photo-gallery/photos/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Security

This gallery is designed for **personal/private use on a trusted network**. Notable security properties:

- **Path traversal protection:** All folder names from URLs are validated. A resolved path must start with the `photos/vacations/` root — requests like `../../etc/passwd` are rejected with a 400 error.
- **No directory listing:** The static file server has `index: false`, so browsing to `/photos/` directly returns a 404 rather than listing files.
- **Dotfile blocking:** Files starting with `.` (e.g., `.DS_Store`, `.env`) are never served.
- **No authentication:** There is no login system. If this server is reachable from the internet, anyone with the URL can view all photos. To restrict access, either run it on a private network, add HTTP basic auth in nginx, or use a VPN.
- **Read-only API:** The server only reads the filesystem — there are no upload, delete, or write endpoints.
- **Download friction:** Several layers discourage casual photo downloading — right-click and drag are blocked on thumbnails; the lightbox renders photos as CSS backgrounds (no "Save image as" on right-click); direct URL access to `/photos/...` requires a valid `Referer` header from the gallery itself, so pasting a photo URL into a new tab returns 403. No measure prevents screenshots or DevTools extraction.
