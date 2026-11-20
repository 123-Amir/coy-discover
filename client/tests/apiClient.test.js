import { describe, it, expect } from 'vitest';
import { createApi, ApiError, describeError } from '../src/api/client.js';

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return handler(url, init); };
  return { fetchImpl, calls };
}
const failure = async (promise) => { try { await promise; } catch (e) { return e; } throw new Error('expected a rejection'); };

describe('api client: requests', () => {
  it('GET /feed sends the limit and returns parsed JSON', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(200, { profiles: [{ id: 1 }] }));
    const api = createApi({ fetchImpl, baseUrl: '/api' });
    expect(await api.getFeed(7)).toEqual({ profiles: [{ id: 1 }] });
    expect(calls[0].url).toBe('/api/feed?limit=7');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].init.cache).toBe('no-store');
  });

  it('POST /swipe sends exactly { profileId, action } as JSON', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(200, { matched: false }));
    const api = createApi({ fetchImpl });
    await api.postSwipe(12, 'like');
    expect(calls[0].url).toBe('/api/swipe');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calls[0].init.body)).toEqual({ profileId: 12, action: 'like' });
  });

  it('GET /me and /matches hit the right paths', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(200, {}));
    const api = createApi({ fetchImpl });
    await api.getMe();
    await api.getMatches();
    expect(calls.map((c) => c.url)).toEqual(['/api/me', '/api/matches']);
  });

  it('honours a custom base URL', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(200, {}));
    await createApi({ fetchImpl, baseUrl: 'http://x.test/api' }).getMatches();
    expect(calls[0].url).toBe('http://x.test/api/matches');
  });
});

describe('api client: errors', () => {
  it('turns a server error body into an ApiError with status and code', async () => {
    const api = createApi({ fetchImpl: fakeFetch(() => json(409, { error: { code: 'ALREADY_SWIPED', message: 'x' } })).fetchImpl });
    const err = await failure(api.postSwipe(1, 'pass'));
    expect(err instanceof ApiError).toBe(true);
    expect(err.status).toBe(409);
    expect(err.code).toBe('ALREADY_SWIPED');
    expect(err.network).toBe(false);
  });

  it('copes with an error response that has no JSON body', async () => {
    const err = await failure(createApi({ fetchImpl: fakeFetch(() => json(502, undefined)).fetchImpl }).getFeed());
    expect(err.status).toBe(502);
    expect(err.code).toBe('HTTP_ERROR');
  });

  it('treats a thrown fetch as a network error', async () => {
    const err = await failure(createApi({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }).getFeed());
    expect(err.network).toBe(true);
    expect(err.status).toBe(0);
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('treats an abort as a TIMEOUT network error', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const err = await failure(createApi({ fetchImpl: async () => { throw abort; } }).getFeed());
    expect(err.network).toBe(true);
    expect(err.code).toBe('TIMEOUT');
  });

  it('aborts a request that exceeds the timeout', async () => {
    const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' }))));
    const err = await failure(createApi({ fetchImpl: hang, timeoutMs: 20 }).getFeed());
    expect(err.code).toBe('TIMEOUT');
  });

  it('rejects a 200 whose body is not a JSON object', async () => {
    const err = await failure(createApi({ fetchImpl: fakeFetch(() => json(200, undefined)).fetchImpl }).getMe());
    expect(err.code).toBe('BAD_RESPONSE');
  });
});

describe('describeError', () => {
  it('gives people friendly, specific messages', () => {
    expect(describeError(new ApiError({ network: true })).message).toMatch(/Can't reach Coy/);
    expect(describeError(new ApiError({ status: 500, code: 'INTERNAL_ERROR' })).message).toMatch(/our side/);
    expect(describeError(new ApiError({ status: 409 })).message).toMatch(/already made a choice/);
    expect(describeError(new ApiError({ status: 404 })).message).toMatch(/isn't available/);
    expect(describeError(new Error('boom')).message).toMatch(/unexpected/);
  });
  it('never shows raw server error text for 5xx', () => {
    const d = describeError(new ApiError({ status: 500, message: 'SQLITE_ERROR: no such table' }));
    expect(d.message.includes('SQLITE')).toBe(false);
  });
});
