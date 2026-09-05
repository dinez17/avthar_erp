import { randomBytes } from 'node:crypto';
import { SixOrbitEncryptionKeyError } from '../domain/sixorbit.errors';
import { SixOrbitCryptoService } from './sixorbit-crypto.service';

const configWithKey = (encKey?: string): string | undefined => encKey;

const validKey = (): string => randomBytes(32).toString('base64');

describe('SixOrbitCryptoService', () => {
  it('round-trips a password', () => {
    const service = new SixOrbitCryptoService(configWithKey(validKey()));
    const secret = service.encrypt('hunter2');
    expect(service.decrypt(secret)).toBe('hunter2');
  });

  it('never stores the plaintext in any of the three parts', () => {
    const service = new SixOrbitCryptoService(configWithKey(validKey()));
    const secret = service.encrypt('hunter2');
    expect(secret.cipher).not.toContain('hunter2');
    expect(secret.iv).not.toContain('hunter2');
    expect(secret.tag).not.toContain('hunter2');
  });

  it('produces different ciphertext for the same password each time', () => {
    // A fresh IV per encryption, so the column cannot be used to tell whether two
    // installations share a password or whether the password changed on a save.
    const service = new SixOrbitCryptoService(configWithKey(validKey()));
    expect(service.encrypt('hunter2').cipher).not.toBe(service.encrypt('hunter2').cipher);
  });

  it('refuses a ciphertext that has been tampered with', () => {
    // This is why GCM: without authentication, an altered row would decrypt to something
    // rather than failing, and we would send that something as a password.
    const service = new SixOrbitCryptoService(configWithKey(validKey()));
    const secret = service.encrypt('hunter2');
    const tampered = Buffer.from(secret.cipher, 'base64');
    tampered.writeUInt8(tampered.readUInt8(0) ^ 0xff, 0);
    expect(() => service.decrypt({ ...secret, cipher: tampered.toString('base64') })).toThrow(
      SixOrbitEncryptionKeyError,
    );
  });

  it('refuses to decrypt under a different key', () => {
    const secret = new SixOrbitCryptoService(configWithKey(validKey())).encrypt('hunter2');
    const other = new SixOrbitCryptoService(configWithKey(validKey()));
    expect(() => other.decrypt(secret)).toThrow(SixOrbitEncryptionKeyError);
  });

  it('reports itself unconfigured rather than throwing at construction', () => {
    // An installation that never uses SixOrbit must still be able to boot.
    const service = new SixOrbitCryptoService(configWithKey(undefined));
    expect(service.isConfigured).toBe(false);
    expect(() => service.encrypt('hunter2')).toThrow(SixOrbitEncryptionKeyError);
  });

  it('rejects a key that is not 32 bytes', () => {
    const service = new SixOrbitCryptoService(configWithKey(randomBytes(16).toString('base64')));
    expect(service.isConfigured).toBe(false);
  });
});
