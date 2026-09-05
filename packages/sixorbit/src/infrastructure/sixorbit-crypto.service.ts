import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { SixOrbitEncryptionKeyError } from '../domain/sixorbit.errors';

/** The three parts of an AES-GCM ciphertext, each base64. */
export interface EncryptedSecret {
  cipher: string;
  iv: string;
  tag: string;
}

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
/** 96 bits is the size GCM is specified for and the size it is fastest at. */
const IV_BYTES = 12;

/**
 * Encrypts the SixOrbit password held in the database.
 *
 * GCM rather than CBC so the ciphertext is authenticated: a password tampered with in the
 * database fails to decrypt rather than decrypting to something else. A fresh random IV
 * per encryption means saving the same password twice produces different ciphertext, so
 * the column cannot be used to tell whether the password changed.
 *
 * The key lives in the environment while the ciphertext lives in the database, which is
 * the whole point — either one alone is useless.
 */
export class SixOrbitCryptoService {
  private readonly key: Buffer | null;

  /** @param encKey 32 bytes of base64, from SIXORBIT_ENC_KEY. */
  constructor(encKey?: string) {
    const raw = encKey;
    if (!raw) {
      // Not fatal at boot: an installation that never uses SixOrbit should still start.
      // Every method that needs the key throws a specific, actionable error instead.
      this.key = null;
      return;
    }
    const key = Buffer.from(raw, 'base64');
    this.key = key.length === KEY_BYTES ? key : null;
  }

  /** Whether a usable key is present, so callers can fail early with a clear message. */
  get isConfigured(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): EncryptedSecret {
    const key = this.requireKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      cipher: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(secret: EncryptedSecret): string {
    const key = this.requireKey();
    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(secret.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(secret.cipher, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Authentication failure means the key changed or the row was altered. Say which,
      // because "decrypt failed" sends people looking in the wrong place — and never echo
      // any part of the ciphertext.
      throw new SixOrbitEncryptionKeyError(
        'The stored SixOrbit password could not be decrypted. This usually means SIXORBIT_ENC_KEY has changed since it was saved — re-enter the password in Settings → SixOrbit.',
      );
    }
  }

  private requireKey(): Buffer {
    if (!this.key) throw new SixOrbitEncryptionKeyError();
    return this.key;
  }
}
