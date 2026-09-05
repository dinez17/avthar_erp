import { z } from 'zod';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Resolves the API base URL.
 *
 * Precedence:
 * 1. VITE_API_URL, when set and sane for the current host.
 * 2. Derived from the host the app is served from.
 *
 * The sanity check matters on a LAN: a configured `http://localhost:3000/api` means
 * "this device" to a phone browsing to http://192.168.1.109:5173, which can never
 * work. In that case the loopback URL is ignored and the API is assumed to live on
 * the same host that served the app.
 */
const resolveApiUrl = (): string => {
  const { protocol, hostname, port: pagePort, origin } = window.location;
  const apiPort = import.meta.env.VITE_API_PORT?.trim() || '3000';

  // Served on a standard port (80/443) means the app is behind the Nginx gateway or a
  // tunnel, where the API is same-origin at /api. A dev server on :5173 talks to the
  // API on its own port instead.
  const derived = pagePort === '' ? `${origin}/api` : `${protocol}//${hostname}:${apiPort}/api`;

  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured) return derived;

  try {
    const configuredHost = new URL(configured).hostname;
    if (LOOPBACK.has(configuredHost) && !LOOPBACK.has(hostname)) {
      console.warn(
        `[config] VITE_API_URL points at ${configuredHost}, which is unreachable from ${hostname}. Using ${derived} instead.`,
      );
      return derived;
    }
    return configured;
  } catch {
    return derived;
  }
};

const schema = z.object({
  apiUrl: z.string().url(),
  appEnv: z.enum(['development', 'test', 'production']).default('development'),
  authBypass: z.boolean().default(false),
});

/** Validated, typed frontend configuration. */
export const env = schema.parse({
  apiUrl: resolveApiUrl(),
  appEnv: import.meta.env.VITE_APP_ENV,
  authBypass: import.meta.env.VITE_AUTH_BYPASS === 'true',
});
