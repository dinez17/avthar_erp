import {
  buildSixOrbitQuery,
  buildSixOrbitUrl,
  describeSixOrbitRequest,
  normaliseBaseUrl,
  redactSecretsInText,
  redactSixOrbitParams,
  SIXORBIT_REDACTED,
} from './sixorbit-url';

describe('buildSixOrbitQuery', () => {
  it('sorts parameters alphabetically', () => {
    // Their server 302-redirects anything not already in this order, so matching it is
    // what stops every call costing an extra round trip.
    const query = buildSixOrbitQuery({ version: '1.0', key: '123', task: 'login' });
    expect(query.toString()).toBe('key=123&task=login&version=1.0');
  });

  it('drops undefined, null and empty values', () => {
    // The real URL that prompted this: `&last_updated&limit=&searchtext` all came back
    // stripped by their server.
    const query = buildSixOrbitQuery({
      task: 'variation/fetch',
      last_updated: undefined,
      limit: '',
      searchtext: null,
      limit_bit: 0,
    });
    expect(query.toString()).toBe('limit_bit=0&task=variation%2Ffetch');
  });

  it('keeps a zero, which is a value and not an absence', () => {
    expect(buildSixOrbitQuery({ limit_bit: 0 }).toString()).toBe('limit_bit=0');
  });

  it('keeps false rather than treating it as empty', () => {
    expect(buildSixOrbitQuery({ balance: false }).toString()).toBe('balance=false');
  });
});

describe('normaliseBaseUrl', () => {
  it('strips trailing slashes so either form can be stored', () => {
    expect(normaliseBaseUrl('http://avthar.sixorbit.com/')).toBe('http://avthar.sixorbit.com');
    expect(normaliseBaseUrl('  http://avthar.sixorbit.com//  ')).toBe('http://avthar.sixorbit.com');
  });
});

describe('buildSixOrbitUrl', () => {
  it('produces the single-endpoint shape their API expects', () => {
    const url = buildSixOrbitUrl('http://avthar.sixorbit.com/', {
      urlq: 'service',
      version: '1.0',
      key: '123',
      task: 'login',
    });
    expect(url).toBe('http://avthar.sixorbit.com/?key=123&task=login&urlq=service&version=1.0');
  });
});

describe('redactSixOrbitParams', () => {
  it('masks the password and the access token', () => {
    const redacted = redactSixOrbitParams({
      task: 'login',
      email: 'rajesh@avthar.com',
      password: 'hunter2',
      access_token: '4132755283700536452',
    });
    expect(redacted.password).toBe(SIXORBIT_REDACTED);
    expect(redacted.access_token).toBe(SIXORBIT_REDACTED);
    // The email is not a secret, and losing it would make the log much harder to read.
    expect(redacted.email).toBe('rajesh@avthar.com');
  });
});

describe('describeSixOrbitRequest', () => {
  it('never contains the credentials it was given', () => {
    const summary = describeSixOrbitRequest({
      task: 'login',
      password: 'hunter2',
      access_token: '4132755283700536452',
    });
    expect(summary).not.toContain('hunter2');
    expect(summary).not.toContain('4132755283700536452');
    expect(summary).toContain('task=login');
  });
});

describe('redactSecretsInText', () => {
  it('masks credentials echoed back inside a query string', () => {
    const text = 'failed for ?task=login&password=hunter2&key=123';
    expect(redactSecretsInText(text)).toBe(
      `failed for ?task=login&password=${SIXORBIT_REDACTED}&key=123`,
    );
  });

  it('masks credentials echoed back inside a JSON body', () => {
    const text = '{"access_token":"4132755283700536452","user_id":"410002661"}';
    const out = redactSecretsInText(text);
    expect(out).not.toContain('4132755283700536452');
    // Non-secret context survives, so the log still says something useful.
    expect(out).toContain('410002661');
  });
});
