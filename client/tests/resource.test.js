import { describe, it, expect } from 'vitest';
import { createResource } from '../src/state/resource.js';
import { ApiError } from '../src/api/client.js';

describe('resource store (matches / me)', () => {
  it('loads once: idle -> loading -> ready', async () => {
    const store = createResource({ fetcher: async () => [1, 2] });
    expect(store.getState().status).toBe('idle');
    const p = store.start();
    expect(store.getState().status).toBe('loading');
    await p;
    expect(store.getState().status).toBe('ready');
    expect(store.getState().data).toEqual([1, 2]);
  });

  it('start() twice only fetches once', async () => {
    let n = 0;
    const store = createResource({ fetcher: async () => ++n });
    await Promise.all([store.start(), store.start()]);
    await store.start();
    expect(n).toBe(1);
  });

  it('reports a first-load failure as error, and recovers on load()', async () => {
    let fail = true;
    const store = createResource({ fetcher: async () => { if (fail) throw new ApiError({ network: true }); return ['ok']; } });
    await store.load();
    expect(store.getState().status).toBe('error');
    expect(store.getState().error.message).toMatch(/Can't reach Coy/);
    fail = false;
    await store.load();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().data).toEqual(['ok']);
  });

  it('keeps showing old data while refreshing, and when a refresh fails', async () => {
    let step = 0;
    const store = createResource({ fetcher: async () => { step++; if (step === 3) throw new ApiError({ status: 500 }); return [step]; } });
    await store.load();
    const p = store.load();
    expect(store.getState().refreshing).toBe(true);
    expect(store.getState().status).toBe('ready');          // no skeleton on refresh
    expect(store.getState().data).toEqual([1]);
    await p;
    expect(store.getState().data).toEqual([2]);
    await store.load();                                      // step 3 fails
    expect(store.getState().status).toBe('ready');
    expect(store.getState().data).toEqual([2]);              // stale data kept
    expect(store.getState().error.message).toMatch(/our side/);
    expect(store.getState().refreshing).toBe(false);
  });

  it('treats an empty list as loaded (so a refresh does not flash a skeleton)', async () => {
    const store = createResource({ fetcher: async () => [] });
    await store.load();
    const p = store.load();
    expect(store.getState().status).toBe('ready');
    await p;
  });

  it('supports subscribe / unsubscribe', async () => {
    const store = createResource({ fetcher: async () => 1 });
    let n = 0;
    const off = store.subscribe(() => n++);
    await store.load();
    expect(n).toBeGreaterThan(0);
    off();
    const m = n;
    await store.load();
    expect(n).toBe(m);
  });
});
