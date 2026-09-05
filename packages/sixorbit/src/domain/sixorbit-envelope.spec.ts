import {
  classifySixOrbitFailure,
  isRetryableFailure,
  parseSixOrbitBody,
  SIXORBIT_RESULT_CODES,
} from './sixorbit-envelope';

describe('parseSixOrbitBody', () => {
  it('reads a success envelope', () => {
    const outcome = parseSixOrbitBody<{ cuid: string }>(
      '{"success":true,"data":{"cuid":"410517802"},"result_code":"20006","message":"Customer added successfully"}',
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.data.cuid).toBe('410517802');
    expect(outcome.resultCode).toBe(SIXORBIT_RESULT_CODES.WRITE_OK);
  });

  it('treats success:false as a failure even though the transport said HTTP 200', () => {
    // The single easiest way to get this integration wrong: their errors are 200s, so
    // anything keyed off the HTTP status reads every failure as a success.
    const outcome = parseSixOrbitBody(
      '{"success":false,"data":{},"result_code":"10001","message":"Order Is already created"}',
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.kind).toBe('DUPLICATE');
  });

  it('does not read result_code 20004 as success on its own', () => {
    // 20004 appears on both outcomes in their own saved responses — success on
    // chat/info, failure on notification/feed — so only `success` may decide.
    const failure = parseSixOrbitBody(
      '{"success":false,"data":{},"result_code":"20004","message":"No Notification found."}',
    );
    expect(failure.ok).toBe(false);

    const success = parseSixOrbitBody(
      '{"success":true,"data":{},"result_code":"20004","message":"Chat user data is fetched."}',
    );
    expect(success.ok).toBe(true);
  });

  it('does not accept a truthy non-boolean as success', () => {
    // Every value in their API is a string. A truthy check would read "false" as success.
    const outcome = parseSixOrbitBody('{"success":"false","data":{}}');
    expect(outcome.ok).toBe(false);
  });

  it('reports a non-JSON body as a transport failure', () => {
    const outcome = parseSixOrbitBody('<html><body>502 Bad Gateway</body></html>');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.kind).toBe('TRANSPORT');
    expect(isRetryableFailure(outcome.kind)).toBe(true);
  });

  it('does not leak credentials from an echoed body into the message', () => {
    const outcome = parseSixOrbitBody('not json ?password=hunter2&task=login');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.message).not.toContain('hunter2');
  });

  it('handles an empty body without throwing', () => {
    const outcome = parseSixOrbitBody('');
    expect(outcome.ok).toBe(false);
  });
});

describe('classifySixOrbitFailure', () => {
  it('recognises their duplicate code', () => {
    expect(classifySixOrbitFailure('10001', 'Order Is already created')).toBe('DUPLICATE');
  });

  it('recognises a rejected session from the message', () => {
    expect(classifySixOrbitFailure(null, 'Invalid access token')).toBe('AUTH');
    expect(classifySixOrbitFailure(null, 'Session expired, please login')).toBe('AUTH');
  });

  it('falls back to UNKNOWN for a code it does not understand', () => {
    expect(classifySixOrbitFailure('99999', 'Something went wrong')).toBe('UNKNOWN');
  });
});

describe('isRetryableFailure', () => {
  it('retries transport and auth, and nothing else', () => {
    expect(isRetryableFailure('TRANSPORT')).toBe(true);
    expect(isRetryableFailure('AUTH')).toBe(true);
    // Retrying a duplicate is how a second customer gets created.
    expect(isRetryableFailure('DUPLICATE')).toBe(false);
    expect(isRetryableFailure('VALIDATION')).toBe(false);
    // Cautious on purpose: a failure we cannot interpret is not one to hammer.
    expect(isRetryableFailure('UNKNOWN')).toBe(false);
  });
});
