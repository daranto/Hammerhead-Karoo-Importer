import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import config from '../config.js';

const ALGO   = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function key() {
  return createHash('sha256').update(config.encryptionKey).digest();
}

/** Encrypt a string → base64 (IV + auth-tag + ciphertext) */
export function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv     = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc    = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a base64 string back to plaintext */
export function decrypt(ciphertext) {
  if (ciphertext == null) return null;
  const buf      = Buffer.from(ciphertext, 'base64');
  const iv       = buf.subarray(0, IV_LEN);
  const tag      = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc      = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Encrypt binary data (Buffer / Uint8Array) → Buffer */
export function encryptBuf(data) {
  if (data == null) return null;
  const iv     = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc    = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

/** Decrypt a Buffer back to a Buffer */
export function decryptBuf(data) {
  if (data == null) return null;
  const buf      = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const iv       = buf.subarray(0, IV_LEN);
  const tag      = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc      = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}
