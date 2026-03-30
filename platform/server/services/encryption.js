import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const KEY_HEX = process.env.DB_ENCRYPTION_KEY;
if (!KEY_HEX) throw new Error('DB_ENCRYPTION_KEY is not set');

const KEY = Buffer.from(KEY_HEX, 'hex');
if (KEY.length !== 32) throw new Error('DB_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts plaintext with AES-256-GCM.
 * Returns a colon-delimited string: iv:authTag:ciphertext (all hex).
 */
export function encrypt(plaintext) {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a value produced by encrypt().
 * Returns null if decryption fails (tampered data, wrong key, etc.).
 */
export function decrypt(ciphertext) {
  try {
    const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return null;
  }
}
