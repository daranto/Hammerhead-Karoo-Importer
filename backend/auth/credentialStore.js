import { encrypt, decrypt } from '../utils/encryption.js';

export function encryptPassword(plaintext) {
  return { enc: encrypt(plaintext), iv: null };
}

export function decryptPassword(enc, _iv) {
  return decrypt(enc);
}
