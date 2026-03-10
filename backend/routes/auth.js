import { Router } from 'express';
import { saveTokens, getTokens, deleteTokens, saveCredentials, getStoredCredentials } from '../auth/tokenStore.js';
import { encryptPassword, decryptPassword } from '../auth/credentialStore.js';
import { loginWithCredentials } from '../services/sramAuth.js';
import getDb from '../db/database.js';

const router = Router();

// GET /api/auth/status
// If no session but credentials exist: auto-restore session from DB token (if valid)
// or re-authenticate with stored credentials.
router.get('/status', async (req, res) => {
  if (!req.session?.userId) {
    const stored = getStoredCredentials();
    if (!stored) return res.json({ authenticated: false, hasCredentials: false });

    const tokens = getTokens(stored.user_id);
    const now = Math.floor(Date.now() / 1000);

    // Token still valid → restore session without an API call
    if (tokens?.access_token && tokens.expires_at > now + 30) {
      req.session.userId = stored.user_id;
      return res.json({
        authenticated: true,
        userId: stored.user_id,
        email: stored.sram_email,
        hasCredentials: true,
      });
    }

    // Token expired → re-authenticate with stored credentials
    try {
      const password = decryptPassword(stored.sram_password_enc, stored.credentials_iv);
      const result = await loginWithCredentials(stored.sram_email, password);
      saveTokens({
        userId: result.userId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        sramEmail: result.sramEmail,
      });
      saveCredentials(result.userId, {
        encPassword: stored.sram_password_enc,
        iv: stored.credentials_iv,
      });
      req.session.userId = result.userId;
      return res.json({
        authenticated: true,
        userId: result.userId,
        email: result.sramEmail,
        hasCredentials: true,
      });
    } catch (err) {
      console.error('Auto re-login failed:', err.message);
      return res.json({ authenticated: false, hasCredentials: true, email: stored.sram_email });
    }
  }

  const tokens = getTokens(req.session.userId);
  res.json({
    authenticated: !!tokens,
    userId: req.session.userId,
    email: tokens?.sram_email || null,
    hasCredentials: !!(tokens?.sram_password_enc),
  });
});

// POST /api/auth/login
// Body: { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email und Passwort erforderlich' });
  }

  try {
    const result = await loginWithCredentials(email, password);

    saveTokens({
      userId: result.userId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      sramEmail: result.sramEmail,
    });

    const { enc, iv } = encryptPassword(password);
    saveCredentials(result.userId, { encPassword: enc, iv });

    req.session.userId = result.userId;
    res.json({ ok: true, userId: result.userId, email: result.sramEmail });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(401).json({ error: err.message });
  }
});

// POST /api/auth/logout – clears session; credentials remain so auto-login works on next visit
router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// POST /api/auth/remove-credentials – fully signs out and removes stored credentials
router.post('/remove-credentials', (req, res) => {
  if (req.session?.userId) {
    deleteTokens(req.session.userId);
  } else {
    // Delete all stored credentials
    const stored = getStoredCredentials();
    if (stored) deleteTokens(stored.user_id);
  }
  req.session = null;
  res.json({ ok: true });
});

export default router;
