import type { SixOrbitImportResult, SixOrbitImportStatus } from '@tiles-erp/shared-types';
import type { SixOrbitCache } from '../domain/sixorbit-ports';

/**
 * Where a running import reports itself.
 *
 * The run happens in the worker and the page asking about it is talking to the API, so
 * the two need somewhere shared to meet. Redis rather than a table because this is
 * progress, not history — the sync log already records what actually happened, and a row
 * per percentage point would be noise on top of it.
 *
 * The key is deliberately singular. Two catalogue imports at once would race each other
 * to write the same products, so the design allows exactly one and says so.
 */
const KEY = 'sixorbit:import:status';

/** Long enough to survive a slow import, short enough that a crash clears itself. */
const TTL_SECONDS = 6 * 60 * 60;

const IDLE: SixOrbitImportStatus = {
  state: 'IDLE',
  startedAt: null,
  finishedAt: null,
  processed: 0,
  totalToProcess: 0,
  since: null,
  startedByName: null,
  result: null,
  error: null,
};

export class SixOrbitImportStatusStore {
  constructor(private readonly cache: SixOrbitCache) {}

  async read(): Promise<SixOrbitImportStatus> {
    return (await this.cache.get<SixOrbitImportStatus>(KEY)) ?? IDLE;
  }

  /** True when nobody else is mid-run. */
  async isRunning(): Promise<boolean> {
    return (await this.read()).state === 'RUNNING';
  }

  async begin(input: {
    since: string | null;
    startedByName: string | null;
  }): Promise<SixOrbitImportStatus> {
    const status: SixOrbitImportStatus = {
      ...IDLE,
      state: 'RUNNING',
      startedAt: new Date().toISOString(),
      since: input.since,
      startedByName: input.startedByName,
    };
    await this.cache.set(KEY, status, TTL_SECONDS);
    return status;
  }

  async progress(processed: number, totalToProcess: number): Promise<void> {
    const current = await this.read();
    // Only a live run reports progress; a late callback must not resurrect a finished one.
    if (current.state !== 'RUNNING') return;
    await this.cache.set(KEY, { ...current, processed, totalToProcess }, TTL_SECONDS);
  }

  async finish(result: SixOrbitImportResult): Promise<void> {
    const current = await this.read();
    await this.cache.set(
      KEY,
      {
        ...current,
        state: 'DONE',
        finishedAt: new Date().toISOString(),
        processed: result.fetched,
        totalToProcess: result.fetched,
        result,
      },
      TTL_SECONDS,
    );
  }

  async fail(error: string): Promise<void> {
    const current = await this.read();
    await this.cache.set(
      KEY,
      { ...current, state: 'FAILED', finishedAt: new Date().toISOString(), error },
      TTL_SECONDS,
    );
  }

  /** Clears a finished or failed run so the page offers the button again. */
  async reset(): Promise<void> {
    await this.cache.del(KEY);
  }
}
