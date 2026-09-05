import { AppError } from '@tiles-erp/shared';
import type { SixOrbitFailureKind } from './sixorbit-envelope';

/**
 * A call to SixOrbit that did not succeed.
 *
 * Carries the failure kind so the queue can decide whether another attempt could possibly
 * help, and their `result_code` so the sync log can say what they actually replied.
 *
 * 502 rather than 500: the fault is upstream, and saying so keeps a SixOrbit outage from
 * reading like a bug in the ERP.
 */
export class SixOrbitApiError extends AppError {
  constructor(
    message: string,
    public readonly kind: SixOrbitFailureKind,
    public readonly resultCode: string | null = null,
  ) {
    super(message, 502, 'SIXORBIT_API_ERROR');
  }
}

/** No active configuration row, so there is nothing to connect to yet. */
export class SixOrbitNotConfiguredError extends AppError {
  constructor(
    message = 'SixOrbit is not configured. Add the connection details in Settings → SixOrbit.',
  ) {
    super(message, 412, 'SIXORBIT_NOT_CONFIGURED');
  }
}

/**
 * `SIXORBIT_ENC_KEY` is missing or malformed.
 *
 * Its own error rather than a generic one because the fix is specific and worth stating:
 * without the key the stored password cannot be decrypted, and no amount of retrying will
 * change that.
 */
export class SixOrbitEncryptionKeyError extends AppError {
  constructor(
    message = 'SIXORBIT_ENC_KEY is not set or is not 32 bytes of base64. Generate one with: openssl rand -base64 32',
  ) {
    super(message, 500, 'SIXORBIT_ENC_KEY_INVALID');
  }
}
