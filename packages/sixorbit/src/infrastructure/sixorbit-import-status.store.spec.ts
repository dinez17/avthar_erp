import type { SixOrbitImportResult } from '@tiles-erp/shared-types';
import type { SixOrbitCache } from '../domain/sixorbit-ports';
import { SixOrbitImportStatusStore } from './sixorbit-import-status.store';

const memoryCache = (): SixOrbitCache => {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string) => Promise.resolve((store.get(key) as T) ?? null),
    set: <T>(key: string, value: T) => {
      store.set(key, value);
      return Promise.resolve();
    },
    del: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    acquireLock: () => Promise.resolve(true),
  };
};

const result: SixOrbitImportResult = {
  dryRun: false,
  fetched: 7682,
  total: 7682,
  productsCreated: 7000,
  productsUpdated: 682,
  brandsCreated: 12,
  categoriesCreated: 40,
  flagged: 3,
  warningCounts: { AREA_DISAGREES_WITH_SIZE: 3 },
  skipped: [],
  durationMs: 42000,
};

describe('SixOrbitImportStatusStore', () => {
  it('reports idle before anything has run', async () => {
    const status = await new SixOrbitImportStatusStore(memoryCache()).read();
    expect(status.state).toBe('IDLE');
    expect(status.result).toBeNull();
  });

  it('reports a run in flight', async () => {
    const store = new SixOrbitImportStatusStore(memoryCache());
    await store.begin({ since: null, startedByName: 'rajesh@avthar.com' });

    expect(await store.isRunning()).toBe(true);
    const status = await store.read();
    expect(status.startedByName).toBe('rajesh@avthar.com');
    expect(status.startedAt).not.toBeNull();
  });

  it('records progress while running', async () => {
    const store = new SixOrbitImportStatusStore(memoryCache());
    await store.begin({ since: null, startedByName: null });
    await store.progress(400, 7682);

    const status = await store.read();
    expect(status.processed).toBe(400);
    expect(status.totalToProcess).toBe(7682);
  });

  it('ignores progress once the run has finished', async () => {
    // A chunk callback can land after the run completes. Without this guard it would put
    // the record back into RUNNING and the page would poll forever.
    const store = new SixOrbitImportStatusStore(memoryCache());
    await store.begin({ since: null, startedByName: null });
    await store.finish(result);
    await store.progress(1, 2);

    const status = await store.read();
    expect(status.state).toBe('DONE');
    expect(status.processed).toBe(result.fetched);
  });

  it('keeps the failure reason so the page can say why it stopped', async () => {
    const store = new SixOrbitImportStatusStore(memoryCache());
    await store.begin({ since: null, startedByName: null });
    await store.fail('SixOrbit did not respond within 30000ms.');

    const status = await store.read();
    expect(status.state).toBe('FAILED');
    expect(status.error).toContain('did not respond');
    expect(await store.isRunning()).toBe(false);
  });

  it('clears back to idle', async () => {
    const store = new SixOrbitImportStatusStore(memoryCache());
    await store.begin({ since: null, startedByName: null });
    await store.reset();
    expect((await store.read()).state).toBe('IDLE');
  });
});
