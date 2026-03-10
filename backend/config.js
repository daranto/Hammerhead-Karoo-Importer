import 'dotenv/config';

export default {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-secret-change-me',
  serverBaseUrl: process.env.SERVER_BASE_URL || 'http://localhost:3001',
  dbPath: process.env.DB_PATH || './data/hammerhead.db',
  sram: {
    clientId: process.env.SRAM_CLIENT_ID || 'MFhsYcUUMGGBPaA4KpGKxUuzyqOY9ReM',
    authUrl: process.env.SRAM_AUTH_URL || 'https://sramid-auth.sram.com',
  },
  hhApiBase: process.env.HH_API_BASE || 'https://dashboard.hammerhead.io',
};
