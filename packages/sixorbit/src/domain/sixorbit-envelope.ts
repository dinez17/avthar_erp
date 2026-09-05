import { redactSecretsInText } from './sixorbit-url';

/**
 * Reading SixOrbit's response envelope.
 *
 * Every reply — success or failure — comes back as HTTP 200 wrapping
 * `{success, data, result_code, message}`. Branching on the HTTP status would therefore
 * treat every business failure as a success, which is the single easiest way to get this
 * integration wrong.
 *
 * `result_code` is not a status on its own either. `20004` is observed as `success:true`
 * on `chat/info` and `success:false` on `notification/feed`. The `success` boolean is the
 * only safe primary signal; the code is useful once we already know it failed, to work out
 * *why*.
 */

/** The raw envelope as it arrives. */
export interface SixOrbitEnvelope {
  success?: unknown;
  data?: unknown;
  result_code?: unknown;
  message?: unknown;
}

export type SixOrbitOutcome<T> =
  | { ok: true; data: T; resultCode: string | null; message: string | null }
  | { ok: false; kind: SixOrbitFailureKind; resultCode: string | null; message: string };

/**
 * Why a call failed, which decides whether retrying it could ever help.
 *
 * - `TRANSPORT` — the request did not complete: timeout, DNS, connection reset, or a
 *   response that was not the JSON envelope at all. Worth retrying.
 * - `AUTH` — the session was rejected. Worth exactly one retry, after a fresh login.
 * - `DUPLICATE` — they already have the record. Retrying creates a second one, so this is
 *   terminal and the caller should adopt what exists instead.
 * - `VALIDATION` — they refused the payload. Retrying sends the same payload, so no.
 * - `UNKNOWN` — an unrecognised `result_code`. Treated as terminal on purpose: hammering
 *   a write endpoint whose failure we do not understand is how duplicates get made.
 */
export type SixOrbitFailureKind = 'TRANSPORT' | 'AUTH' | 'DUPLICATE' | 'VALIDATION' | 'UNKNOWN';

/** Result codes confirmed from saved responses in their Postman collection. */
export const SIXORBIT_RESULT_CODES = {
  /** Fetch succeeded. */
  FETCH_OK: '20003',
  /** Add or update succeeded. */
  WRITE_OK: '20006',
  /** Update succeeded (secondary sales). */
  UPDATE_OK: '20009',
  /** "Order Is already created" — their own duplicate detection. */
  DUPLICATE: '10001',
} as const;

/**
 * Codes known to mean "already exists".
 *
 * Only one is confirmed so far. Anything not listed falls through to `UNKNOWN`, which is
 * terminal — deliberately the cautious direction for a code we cannot interpret.
 */
const DUPLICATE_CODES = new Set<string>([SIXORBIT_RESULT_CODES.DUPLICATE]);

/**
 * Recognising a rejected session from the message text.
 *
 * SixOrbit has not published a result code for an expired or invalid token, so there is
 * nothing better to match on yet. The cost of a false positive is one wasted re-login;
 * the cost of a false negative is every call failing until someone restarts the service.
 * Given that asymmetry, matching on text is the right trade for now.
 *
 * TODO(12.x): replace with the real code once SixOrbit confirms it (plan G-series).
 */
const AUTH_MESSAGE_PATTERNS = [
  /invalid\s+(access\s+)?token/i,
  /token\s+(expired|invalid|mismatch)/i,
  /session\s+(expired|invalid)/i,
  /please\s+login/i,
  /unauthori[sz]ed/i,
  /not\s+logged\s+in/i,
];

export function classifySixOrbitFailure(
  resultCode: string | null,
  message: string | null,
): SixOrbitFailureKind {
  if (resultCode && DUPLICATE_CODES.has(resultCode)) return 'DUPLICATE';
  if (message && AUTH_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) return 'AUTH';
  return 'UNKNOWN';
}

/** Whether the queue should try this again. */
export function isRetryableFailure(kind: SixOrbitFailureKind): boolean {
  return kind === 'TRANSPORT' || kind === 'AUTH';
}

const asStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== ''
    ? value
    : typeof value === 'number'
      ? String(value)
      : null;

/**
 * Parses a response body into an outcome.
 *
 * A body that is not JSON is treated as `TRANSPORT` rather than a business failure: it
 * usually means a gateway error page or an HTML redirect, which is exactly the sort of
 * thing that clears on its own.
 */
export function parseSixOrbitBody<T>(body: string): SixOrbitOutcome<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    const preview = redactSecretsInText(body.slice(0, 200));
    return {
      ok: false,
      kind: 'TRANSPORT',
      resultCode: null,
      message: `SixOrbit returned a non-JSON response: ${preview || '(empty body)'}`,
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      ok: false,
      kind: 'TRANSPORT',
      resultCode: null,
      message: 'SixOrbit returned a JSON value that was not an envelope object.',
    };
  }

  const envelope = parsed as SixOrbitEnvelope;
  const resultCode = asStringOrNull(envelope.result_code);
  const message = asStringOrNull(envelope.message);

  // Strictly `=== true`. Their ids arrive as strings throughout, and a truthy check would
  // read a string "false" as success.
  if (envelope.success === true) {
    return { ok: true, data: envelope.data as T, resultCode, message };
  }

  return {
    ok: false,
    kind: classifySixOrbitFailure(resultCode, message),
    resultCode,
    message: message ?? 'SixOrbit rejected the request without giving a reason.',
  };
}
