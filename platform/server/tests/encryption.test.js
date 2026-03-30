import { describe, it, expect } from 'vitest';

// Set a test key before importing the module
process.env.DB_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex

const { encrypt, decrypt } = await import('../services/encryption.js');

describe('encryption service', () => {
  it('round-trips plaintext correctly', () => {
    const plaintext = 'test@example.com';
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext each call (unique IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
  });

  it('decrypt returns null for tampered ciphertext', () => {
    const result = decrypt('badinput:badhex:badhex');
    expect(result).toBeNull();
  });
});
