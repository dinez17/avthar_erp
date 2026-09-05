import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';
import selfsigned from 'selfsigned';

export interface HttpsCredentials {
  key: string;
  cert: string;
}

const CERT_DIR = join(process.cwd(), 'certs');
const KEY_PATH = join(CERT_DIR, 'dev-key.pem');
const CERT_PATH = join(CERT_DIR, 'dev-cert.pem');

/** LAN IPv4 addresses, added to the certificate so phones accept the host. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

/**
 * Loads TLS credentials for the dev server. Explicit paths win; otherwise a
 * self-signed certificate covering localhost and the machine's LAN addresses is
 * generated once and cached under `certs/`.
 *
 * Self-signed certificates are for development only — production should terminate
 * TLS at Nginx with a certificate from a real authority.
 */
export function loadHttpsCredentials(keyFile?: string, certFile?: string): HttpsCredentials {
  if (keyFile && certFile) {
    return { key: readFileSync(keyFile, 'utf8'), cert: readFileSync(certFile, 'utf8') };
  }

  if (existsSync(KEY_PATH) && existsSync(CERT_PATH)) {
    return { key: readFileSync(KEY_PATH, 'utf8'), cert: readFileSync(CERT_PATH, 'utf8') };
  }

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...lanAddresses().map((ip) => ({ type: 7, ip })),
  ];
  const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 825,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }],
  });

  mkdirSync(CERT_DIR, { recursive: true });
  writeFileSync(KEY_PATH, pems.private);
  writeFileSync(CERT_PATH, pems.cert);
  return { key: pems.private, cert: pems.cert };
}
