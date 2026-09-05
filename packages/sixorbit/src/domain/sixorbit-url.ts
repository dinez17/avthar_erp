/**
 * URL construction for SixOrbit's single-endpoint API.
 *
 * Their whole API is one URL dispatched by a `task` query parameter:
 *
 *   http://<tenant>.sixorbit.com/?urlq=service&version=4.0&key=123&task=<task>&...
 *
 * Two observed behaviours shape everything here. Their server **drops parameters with no
 * value** and **302-redirects to the parameters in alphabetical order**, so a request that
 * does not already match that shape costs an extra round trip. And credentials travel in
 * the query string, which means a raw URL must never reach a log.
 */

/** Values a task parameter can take before it is stringified. */
export type SixOrbitParamValue = string | number | boolean | null | undefined;
export type SixOrbitParams = Record<string, SixOrbitParamValue>;

/** What a masked secret is replaced with. */
export const SIXORBIT_REDACTED = '***';

/**
 * Parameters that must never be written down.
 *
 * `password` is obvious. `access_token` is here because it is a bearer credential in all
 * but name: anyone holding it can act as the user until it is revoked.
 */
export const SIXORBIT_SECRET_PARAMS: readonly string[] = ['password', 'access_token'];

/** Trailing slashes removed, so callers can store the base URL either way. */
export function normaliseBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Drops empty values and sorts what remains by key.
 *
 * Empty means `undefined`, `null` or `''`. Their server discards those anyway — a URL
 * ending `&last_updated&limit=&searchtext` comes back redirected with all three gone — so
 * sending them buys nothing and costs a redirect.
 */
export function buildSixOrbitQuery(params: SixOrbitParams): URLSearchParams {
  const search = new URLSearchParams();
  const keys = Object.keys(params).sort();
  for (const key of keys) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    const asString = typeof value === 'string' ? value : String(value);
    if (asString === '') continue;
    search.append(key, asString);
  }
  return search;
}

/** The full request URL. Never log the result — use {@link describeSixOrbitRequest}. */
export function buildSixOrbitUrl(baseUrl: string, params: SixOrbitParams): string {
  return `${normaliseBaseUrl(baseUrl)}/?${buildSixOrbitQuery(params).toString()}`;
}

/** The same parameters with every secret masked, safe to persist or print. */
export function redactSixOrbitParams(params: SixOrbitParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === undefined || value === null || value === '') continue;
    out[key] = SIXORBIT_SECRET_PARAMS.includes(key)
      ? SIXORBIT_REDACTED
      : typeof value === 'string'
        ? value
        : String(value);
  }
  return out;
}

/**
 * A one-line, credential-free description of a request, for the sync log.
 *
 * This — not the URL — is what gets stored, so that reading the log can never be a way of
 * harvesting the password.
 */
export function describeSixOrbitRequest(params: SixOrbitParams): string {
  const redacted = redactSixOrbitParams(params);
  return Object.entries(redacted)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/**
 * Masks anything credential-shaped inside free text.
 *
 * Their error messages sometimes echo the request back. Belt and braces: the parameters
 * are masked before they are ever formatted, and this catches whatever the remote end
 * decided to include on its own.
 */
export function redactSecretsInText(text: string): string {
  let out = text;
  for (const key of SIXORBIT_SECRET_PARAMS) {
    out = out.replace(new RegExp(`(${key}=)[^&\\s"']+`, 'gi'), `$1${SIXORBIT_REDACTED}`);
    out = out.replace(new RegExp(`("${key}"\\s*:\\s*")[^"]*(")`, 'gi'), `$1${SIXORBIT_REDACTED}$2`);
  }
  return out;
}
