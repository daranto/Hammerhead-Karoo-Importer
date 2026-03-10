# Hammerhead Activity Importer

A self-hosted PWA to automatically fetch, cache, and visualize cycling activities from the Hammerhead Dashboard (dashboard.hammerhead.io).

## ⚠️ Security Warning

**Do not expose this app to the public internet.**

This tool is designed for personal, local use only. It stores your SRAM/Hammerhead credentials and OAuth tokens in a local SQLite database and has no multi-user authentication, rate limiting, or hardening against external attacks. Exposing it publicly could allow others to access your account tokens and activity data.

**Recommended access methods:**
- Run locally on your own machine (`localhost`)
- Access over a private VPN (e.g. [Tailscale](https://tailscale.com)) from your own devices
- Restrict access to your local home network only

**Do not** put this behind a public-facing reverse proxy, assign it a public domain, or open it to the internet — even with HTTPS.

---

## Features

- **Auto-sync** from Hammerhead API via SRAM ID OAuth2 PKCE login
- **Force sync** – re-fetches all activities and clears cached GPS records to pick up new data
- **Interactive maps** with Leaflet/OSM – route with direction arrows, km markers, start/finish dots
- **Charts** – elevation, speed, pace, heart rate, power, cadence, temperature (draggable / reorderable)
- **Stats grid** – distance, moving time, elapsed time, elevation, speed, pace, HR, power, cadence, calories, temperature
- **Calorie estimation** – power-based, HR/Swain formula, or MET-based when no native value is present
- **User profile** – body weight, age, gender stored for calorie calculation
- **Share image** – dynamic-height PNG canvas with GPS route, selectable stats & charts, horizontal or vertical layout, language-aware labels; exported via Web Share API or download; preferences remembered
- **FIT & GPX upload** – drag & drop, parsed locally
- **Full encryption at rest** – every sensitive field in the SQLite database (tokens, activity names, polylines, files, profile) is AES-256-GCM encrypted; the DB is unreadable without `ENCRYPTION_KEY`
- **PWA** – installable on iOS/Android when accessed over a trusted local network
- **Self-hosted** – SQLite database, Docker deployment

## Quick Start

### Development

```bash
# 1. Copy environment config
cp .env.example .env
# Edit .env: set ENCRYPTION_KEY and SERVER_BASE_URL

# 2. Install & start backend
cd backend && npm install
npm run dev   # port 3001

# 3. Install & start frontend (new terminal)
cd frontend && npm install
npm run dev   # port 5173 (proxies /api to :3001)
```

Open http://localhost:5173

### Production (Docker) – pre-built image

The easiest way. A Docker image is automatically built and published to the GitHub Container Registry on every release.

```bash
# 1. Download the compose file
curl -O https://raw.githubusercontent.com/daranto/Hammerhead-Karoo-Importer/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/daranto/Hammerhead-Karoo-Importer/main/.env.example

# 2. Configure
cp .env.example .env
# Edit .env: set ENCRYPTION_KEY (generate with: openssl rand -hex 32)

# 3. Run
docker compose pull
docker compose up -d
```

Open http://localhost:3001

### Production (Docker) – build from source

```bash
cp .env.example .env
# Edit .env: set ENCRYPTION_KEY

docker compose up -d --build
```

Open http://localhost:3001

## Usage

1. Open the app and click **Connect with SRAM ID**
2. Authenticate with your SRAM account
3. Click **⟳ Sync** to fetch all activities from Hammerhead
4. Tap any activity to view the full map + stats
5. Use the **Share** button to generate a 1200×630 PNG share image
6. Or **+ Upload** to import a local `.fit` file

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENCRYPTION_KEY` | 32-byte hex key – encrypts all data at rest (`openssl rand -hex 32`) | *required* |
| `SERVER_BASE_URL` | URL of the app (local only) | `http://localhost:3001` |
| `DB_PATH` | SQLite database path | `/app/data/hammerhead.db` |
| `PORT` | HTTP port | `3001` |

> **Important:** keep `ENCRYPTION_KEY` secret and back it up. Losing it means losing access to all stored data. The SQLite database is fully encrypted and unreadable without this key.

## Tech Stack

- **Backend**: Node.js 24 / Express 5 / `node:sqlite` (built-in, stable) / Axios
- **Frontend**: React 19 / Vite 7 / React-Leaflet 5 / CSS Modules
- **PWA**: vite-plugin-pwa / Workbox
- **Auth**: OAuth2 PKCE with SRAM ID → Hammerhead token exchange
- **Data**: SQLite via Node's built-in `node:sqlite` module (stable since Node 24)

## Notes

- **Single-user design**: stores one user's tokens in SQLite. For multi-user, extend the `tokens` table and session handling.
- **Node version**: requires Node 24+. The `node:sqlite` module is stable in Node 24 (no experimental flags needed).
- **FIT parser**: converts semicircle coordinates (`value / 11930465`) to decimal degrees automatically.
- **Share canvas**: GPS coordinates projected directly to canvas pixels – no CORS issues with OSM tiles.
