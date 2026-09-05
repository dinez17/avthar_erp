import { SIXORBIT_TASKS } from '../domain/sixorbit-task';
import type {
  SixOrbitSyncLogEntry,
  SixOrbitSyncLogRepository,
} from '../domain/sixorbit-sync-log.repository';
import { SixOrbitHttpService, type SixOrbitRequest } from './sixorbit-http.service';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

/**
 * A complete stub of the log port, with only `record` overridden per test.
 *
 * Built from one factory on purpose. Hand-rolled object literals are exactly why two
 * older specs in this repo stopped compiling when their ports grew a method — with this,
 * adding one to `SixOrbitSyncLogRepository` breaks a single line instead of every spec.
 */
const stubSyncLog = (record: SixOrbitSyncLogRepository['record']): SixOrbitSyncLogRepository => ({
  record,
  list: jest.fn(),
  health: jest.fn(),
  prune: jest.fn(),
});

describe('SixOrbitHttpService', () => {
  let recorded: SixOrbitSyncLogEntry[];
  let service: SixOrbitHttpService;
  const fetchMock = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>();

  const request = (over: Partial<SixOrbitRequest> = {}): SixOrbitRequest => ({
    spec: SIXORBIT_TASKS.LOGIN,
    baseUrl: 'http://avthar.sixorbit.com',
    apiKey: '123',
    timeoutMs: 5000,
    params: { email: 'rajesh@avthar.com', password: 'hunter2', app_flag: '2' },
    log: { entityType: 'CONNECTION', direction: 'PUSH' },
    ...over,
  });

  beforeEach(() => {
    recorded = [];
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new SixOrbitHttpService(
      stubSyncLog(async (entry) => {
        recorded.push(entry);
      }),
    );
  });

  it('builds the single-endpoint URL with sorted parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await service.execute(request());

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.startsWith('http://avthar.sixorbit.com/?')).toBe(true);
    const query = new URL(url).searchParams;
    expect(query.get('task')).toBe('login');
    expect(query.get('urlq')).toBe('service');
    // The version comes from the task registry, not a constant: their tasks disagree.
    expect(query.get('version')).toBe('1.0');
  });

  it('appends the session only for authenticated tasks', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));

    await service.execute(request());
    expect(new URL(fetchMock.mock.calls[0]![0] as string).searchParams.has('access_token')).toBe(
      false,
    );

    await service.execute(
      request({
        spec: SIXORBIT_TASKS.FETCH_BRAND,
        auth: { userId: '410002661', accessToken: 'tok' },
        params: {},
      }),
    );
    const second = new URL(fetchMock.mock.calls[1]![0] as string).searchParams;
    expect(second.get('access_token')).toBe('tok');
    expect(second.get('user_id')).toBe('410002661');
  });

  it('records every attempt, with the credentials masked', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: {}, result_code: '20003', message: 'ok' }),
    );
    await service.execute(request());

    expect(recorded).toHaveLength(1);
    const entry = recorded[0]!;
    expect(entry.success).toBe(true);
    expect(entry.task).toBe('login');
    // The request summary is what the sync console shows. It must never be a way of
    // reading the password back out of the system.
    expect(entry.requestSummary).not.toContain('hunter2');
    expect(entry.requestSummary).toContain('task=login');
  });

  it('records a failure and does not mistake HTTP 200 for success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, data: {}, result_code: '10001', message: 'already created' }),
    );
    const outcome = await service.execute(request());

    expect(outcome.ok).toBe(false);
    expect(recorded[0]!.success).toBe(false);
    expect(recorded[0]!.resultCode).toBe('10001');
  });

  it('reports a timeout as a transport failure and still logs it', async () => {
    fetchMock.mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    const outcome = await service.execute(request({ timeoutMs: 25 }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.kind).toBe('TRANSPORT');
    // A call that never reached them is exactly the one an operator needs to see.
    expect(recorded).toHaveLength(1);
  });

  it('names the HTTP status when the body is not their envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse('<html>502</html>', 502));
    const outcome = await service.execute(request());
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.message).toContain('502');
  });

  it('refuses a redirected POST instead of trusting a reply to a body-less request', async () => {
    // A 302 downgrades a POST to a GET and drops the payload, so SixOrbit would have been
    // asked to create a customer with no customer in the request. Their answer to that is
    // an ordinary failure message, which is exactly why this has to be caught here.
    const redirected = new Response(JSON.stringify({ success: false, message: 'invalid data' }), {
      status: 200,
    });
    Object.defineProperty(redirected, 'redirected', { value: true });
    fetchMock.mockResolvedValue(redirected);

    const outcome = await service.execute(
      request({
        spec: SIXORBIT_TASKS.ADD_CUSTOMER,
        auth: { userId: '1', accessToken: 't' },
        params: {},
        data: { fname: 'Test' },
      }),
    );

    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.kind).toBe('TRANSPORT');
    expect(outcome.message).toContain('base URL');
  });

  it('leaves a redirected GET alone, since a GET survives one intact', async () => {
    const redirected = new Response(JSON.stringify({ success: true, data: { ok: 1 } }), {
      status: 200,
    });
    Object.defineProperty(redirected, 'redirected', { value: true });
    fetchMock.mockResolvedValue(redirected);

    const outcome = await service.execute(request());
    expect(outcome.ok).toBe(true);
  });

  it('does not let a failed log write replace the real outcome', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { ok: 1 } }));
    service = new SixOrbitHttpService(
      stubSyncLog(() => Promise.reject(new Error('log table is full'))),
    );

    const outcome = await service.execute(request());
    expect(outcome.ok).toBe(true);
  });

  it('sends a POST body as one multipart field called data', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await service.execute(
      request({
        spec: SIXORBIT_TASKS.ADD_CUSTOMER,
        auth: { userId: '1', accessToken: 't' },
        params: {},
        data: { fname: 'Test' },
      }),
    );

    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(JSON.parse(form.get('data') as string)).toEqual({ fname: 'Test' });
  });

  it('wraps a variation payload in an array, because their variation tasks require one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await service.execute(
      request({
        spec: SIXORBIT_TASKS.CREATE_VARIATION,
        auth: { userId: '1', accessToken: 't' },
        params: {},
        data: { item_name: 'ABC' },
      }),
    );

    const form = fetchMock.mock.calls[0]![1]!.body as FormData;
    expect(JSON.parse(form.get('data') as string)).toEqual([{ item_name: 'ABC' }]);
  });

  it('logs the payload it posted, exactly as it went out', async () => {
    // Their rejections name a field but never quote the value — "Please Provide valid item
    // name" says nothing about what the item name was. Without the body on the log row a
    // failed write can only be diagnosed by guessing, which is how one of these cost an
    // afternoon.
    fetchMock.mockResolvedValue(jsonResponse({ success: false, message: 'no' }));
    await service.execute(
      request({
        spec: SIXORBIT_TASKS.EDIT_VARIATION,
        auth: { userId: '1', accessToken: 't' },
        params: {},
        data: { item_name: 'ABC', isvid: '1220' },
      }),
    );

    expect(JSON.parse(recorded[0]!.requestBody as string)).toEqual([
      { item_name: 'ABC', isvid: '1220' },
    ]);
  });

  it('records no payload for a GET, which has none', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await service.execute(request());

    expect(recorded[0]!.requestBody).toBeNull();
  });

  it('masks a credential inside the payload as well as in the query string', async () => {
    // The customer tasks put nothing secret in the body today, but a log column that is
    // only safe by coincidence is not safe.
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await service.execute(
      request({
        spec: SIXORBIT_TASKS.ADD_CUSTOMER,
        auth: { userId: '1', accessToken: 'secret-token' },
        params: {},
        data: { access_token: 'secret-token' },
      }),
    );

    expect(recorded[0]!.requestBody).not.toContain('secret-token');
  });
});
