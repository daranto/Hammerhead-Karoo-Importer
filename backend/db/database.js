import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { createDecipheriv, createHash } from 'node:crypto';
import config from '../config.js';
import { encrypt, encryptBuf } from '../utils/encryption.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

/** Decrypt a value that was encrypted with the old AES-256-CBC scheme. */
function legacyCbcDecrypt(enc, iv) {
  const key = createHash('sha256').update(config.encryptionKey).digest();
  const decipher = createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]).toString('utf8');
}

export function getDb() {
  if (!db) {
    // Ensure data directory exists
    const dbPath = config.dbPath;
    const dir = dbPath.includes('/')
      ? dbPath.substring(0, dbPath.lastIndexOf('/'))
      : '.';
    mkdirSync(dir, { recursive: true });

    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);

    // Column migrations (try-catch pattern for idempotency)
    try { db.exec('ALTER TABLE tokens ADD COLUMN sram_password_enc TEXT'); } catch {}
    try { db.exec('ALTER TABLE tokens ADD COLUMN credentials_iv TEXT'); } catch {}
    try { db.exec('ALTER TABLE activities ADD COLUMN calories_estimated INTEGER DEFAULT 0'); } catch {}
    try { db.exec('ALTER TABLE activities ADD COLUMN avg_temp REAL'); } catch {}
    try { db.exec('ALTER TABLE activity_records ADD COLUMN temperature_c REAL'); } catch {}

    // One-time data migration: encrypt all plaintext data (user_version tracks progress)
    const { user_version } = db.prepare('PRAGMA user_version').get();
    if (user_version < 1) {
      db.exec('BEGIN');
      try {
        // --- recreate user_profile without gender CHECK constraint ---
        db.exec(`
          CREATE TABLE IF NOT EXISTS user_profile_v2 (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            weight_kg TEXT,
            age TEXT,
            gender TEXT,
            updated_at INTEGER DEFAULT (unixepoch())
          )
        `);
        const existingProfile = db.prepare('SELECT * FROM user_profile WHERE id=1').get();
        if (existingProfile) {
          db.prepare('INSERT OR REPLACE INTO user_profile_v2 (id, weight_kg, age, gender, updated_at) VALUES (1, ?, ?, ?, ?)')
            .run(existingProfile.weight_kg, existingProfile.age, existingProfile.gender, existingProfile.updated_at);
        }
        db.exec('DROP TABLE user_profile');
        db.exec('ALTER TABLE user_profile_v2 RENAME TO user_profile');

        // --- tokens ---
        for (const token of db.prepare('SELECT * FROM tokens').all()) {
          let newPassword = token.sram_password_enc;
          // Migrate CBC-encrypted password to GCM
          if (token.sram_password_enc && token.credentials_iv) {
            try {
              newPassword = encrypt(legacyCbcDecrypt(token.sram_password_enc, token.credentials_iv));
            } catch {
              newPassword = null; // corrupt – drop it
            }
          } else if (token.sram_password_enc) {
            // Already some value but no IV – leave as-is (shouldn't happen)
            newPassword = token.sram_password_enc;
          }
          db.prepare(
            'UPDATE tokens SET access_token=?, refresh_token=?, sram_email=?, sram_password_enc=?, credentials_iv=NULL WHERE user_id=?'
          ).run(
            token.access_token  ? encrypt(token.access_token)  : null,
            token.refresh_token ? encrypt(token.refresh_token) : null,
            token.sram_email    ? encrypt(token.sram_email)    : null,
            newPassword,
            token.user_id,
          );
        }

        // --- activities ---
        const updateAct = db.prepare('UPDATE activities SET name=?, raw_json=? WHERE id=?');
        for (const act of db.prepare('SELECT id, name, raw_json FROM activities').all()) {
          updateAct.run(
            act.name     ? encrypt(act.name)     : null,
            act.raw_json ? encrypt(act.raw_json) : null,
            act.id,
          );
        }

        // --- activity_polylines ---
        const updatePoly = db.prepare('UPDATE activity_polylines SET encoded_polyline=? WHERE activity_id=?');
        for (const poly of db.prepare('SELECT activity_id, encoded_polyline FROM activity_polylines').all()) {
          if (poly.encoded_polyline) {
            updatePoly.run(encrypt(poly.encoded_polyline), poly.activity_id);
          }
        }

        // --- fit_files ---
        const updateFit = db.prepare('UPDATE fit_files SET file_data=? WHERE activity_id=?');
        for (const fit of db.prepare('SELECT activity_id, file_data FROM fit_files').all()) {
          if (fit.file_data) {
            updateFit.run(encryptBuf(Buffer.from(fit.file_data)), fit.activity_id);
          }
        }

        // --- user_profile (already recreated without CHECK constraint above) ---
        const profile = db.prepare('SELECT * FROM user_profile WHERE id=1').get();
        if (profile) {
          db.prepare('UPDATE user_profile SET weight_kg=?, age=?, gender=? WHERE id=1').run(
            profile.weight_kg != null ? encrypt(String(profile.weight_kg)) : null,
            profile.age       != null ? encrypt(String(profile.age))       : null,
            profile.gender    != null ? encrypt(profile.gender)            : null,
          );
        }

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      db.exec('PRAGMA user_version = 1');
    }
  }
  return db;
}

export default getDb;
