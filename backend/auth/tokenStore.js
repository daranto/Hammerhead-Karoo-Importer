import getDb from '../db/database.js';
import { encrypt, decrypt } from '../utils/encryption.js';

export function saveTokens({ userId, accessToken, refreshToken, expiresAt, sramEmail }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO tokens (user_id, access_token, refresh_token, expires_at, sram_email)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      sram_email = excluded.sram_email
  `).run(
    userId,
    accessToken ? encrypt(accessToken) : null,
    refreshToken ? encrypt(refreshToken) : null,
    expiresAt,
    sramEmail ? encrypt(sramEmail) : null,
  );
}

function decryptRow(row) {
  if (!row) return null;
  return {
    ...row,
    access_token:  row.access_token  ? decrypt(row.access_token)  : null,
    refresh_token: row.refresh_token ? decrypt(row.refresh_token) : null,
    sram_email:    row.sram_email    ? decrypt(row.sram_email)    : null,
  };
}

export function getTokens(userId) {
  const db = getDb();
  return decryptRow(db.prepare('SELECT * FROM tokens WHERE user_id = ?').get(userId));
}

export function deleteTokens(userId) {
  const db = getDb();
  db.prepare('DELETE FROM tokens WHERE user_id = ?').run(userId);
}

export function getFirstUser() {
  const db = getDb();
  return decryptRow(db.prepare('SELECT * FROM tokens LIMIT 1').get());
}

export function saveCredentials(userId, { encPassword, iv }) {
  const db = getDb();
  db.prepare(
    'UPDATE tokens SET sram_password_enc = ?, credentials_iv = ? WHERE user_id = ?'
  ).run(encPassword, iv, userId);
}

export function getStoredCredentials() {
  const db = getDb();
  const row = db.prepare(
    'SELECT user_id, sram_email, sram_password_enc, credentials_iv FROM tokens WHERE sram_password_enc IS NOT NULL LIMIT 1'
  ).get();
  if (!row) return null;
  return {
    ...row,
    sram_email: row.sram_email ? decrypt(row.sram_email) : null,
  };
}
