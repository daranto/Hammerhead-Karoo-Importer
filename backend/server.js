import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieSession from 'cookie-session';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import config from './config.js';

if (!config.encryptionKey || config.encryptionKey === 'dev-secret-change-me') {
  console.error('ERROR: ENCRYPTION_KEY is not set or is still the default placeholder.');
  console.error('Generate a key with: openssl rand -hex 32');
  process.exit(1);
}

import { getDb } from './db/database.js';
import authRouter from './routes/auth.js';
import activitiesRouter from './routes/activities.js';
import uploadRouter from './routes/upload.js';
import profileRouter from './routes/profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// Security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        // App runs on HTTP — disable Helmet's production default that upgrades
        // all requests to HTTPS, which would break asset loading on local network
        upgradeInsecureRequests: null,
      },
    },
  })
);

app.use(
  cors({
    origin: config.nodeEnv === 'development'
      ? true                   // allow any origin in dev (localhost + IP)
      : config.serverBaseUrl,
    credentials: true,
  })
);

app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cookieSession({
    name: 'hh_session',
    secret: config.encryptionKey,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    // secure: false — app is designed for local HTTP access only (see README)
    secure: false,
    sameSite: 'lax',
    httpOnly: true,
  })
);

// Initialize DB
getDb();

// API routes
app.use('/api/auth', authRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/profile', profileRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Serve frontend in production
const frontendDist = join(__dirname, '../frontend/dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('/{*splat}', (req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Hammerhead Importer running on port ${config.port} [${config.nodeEnv}]`);
});

export default app;
