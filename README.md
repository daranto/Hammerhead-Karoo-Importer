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

- **Auto-sync** from Hammerhead API via SRAM ID OAuth2 PKCE
- **Interactive maps** with Leaflet/OSM – route overview + start/finish markers
- **Elevation profile** in pure SVG (no charting library)
- **Stats grid** – distance, time, elevation, speed, HR, power, cadence, calories
- **Share image** – 1200×630 PNG canvas with GPS route and selectable stats, exported via Web Share API or download
- **FIT file upload** – drag & drop `.fit` files, parsed locally
- **PWA** – installable on iOS/Android when accessed over a trusted local network
- **Self-hosted** – SQLite database, Docker deployment

## Quick Start

### Development

```bash
# 1. Copy environment config
cp .env.example .env
# Edit .env: set SESSION_SECRET and SERVER_BASE_URL

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
# Edit .env: set SESSION_SECRET (any long random string)

# 3. Run
docker compose pull
docker compose up -d
```

Open http://localhost:3001

### Production (Docker) – build from source

```bash
cp .env.example .env
# Edit .env: set SESSION_SECRET

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
| `SESSION_SECRET` | 32+ char random string | *required* |
| `SERVER_BASE_URL` | URL of the app (local only) | `http://localhost:3001` |
| `DB_PATH` | SQLite database path | `/app/data/hammerhead.db` |
| `PORT` | HTTP port | `3001` |

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
