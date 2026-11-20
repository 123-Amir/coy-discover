// The only module that talks to the backend. Everything else receives plain data or an ApiError.

export class ApiError extends Error {
  constructor({ status = 0, code = 'UNKNOWN', message = 'Request failed', network = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;     // HTTP status, or 0 when the request never got an answer
    this.code = code;         // the server's error code, or NETWORK_ERROR / TIMEOUT / BAD_RESPONSE
    this.network = network;
  }
}

/** Turn any thrown value into { message, network, status, code } that is safe to show a person. */
export function describeError(err) {
  if (err instanceof ApiError) {
    const base = { network: err.network, status: err.status, code: err.code };
    if (err.network) return { ...base, message: "Can't reach Coy right now. Check your connection and try again." };
    if (err.status >= 500) return { ...base, message: 'Something went wrong on our side. Please try again in a moment.' };
    if (err.status === 409) return { ...base, message: "You've already made a choice on this profile." };
    if (err.status === 404) return { ...base, message: "That profile isn't available any more." };
    return { ...base, message: err.message };
  }
  return { network: false, status: 0, code: 'UNKNOWN', message: 'Something unexpected happened. Please try again.' };
}

/**
 * @param {{ fetchImpl?: typeof fetch, baseUrl?: string, timeoutMs?: number }} options
 * fetchImpl and baseUrl are injectable so tests can point the client at a fake or at the real API.
 */
export function createApi({ fetchImpl, baseUrl = '/api', timeoutMs = 10_000 } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  async function request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (err) {
      throw new ApiError({
        network: true,
        code: err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: 'Network request failed',
      });
    } finally {
      clearTimeout(timer);
    }

    let data = null;
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const e = data?.error;
      throw new ApiError({
        status: res.status,
        code: typeof e?.code === 'string' ? e.code : 'HTTP_ERROR',
        message: typeof e?.message === 'string' ? e.message : `Request failed (${res.status})`,
      });
    }
    if (data === null || typeof data !== 'object') {
      throw new ApiError({ status: res.status, code: 'BAD_RESPONSE', message: 'Unexpected response from the server' });
    }
    return data;
  }

  return {
    getMe: () => request('/me'),
    getFeed: (limit = 10) => request(`/feed?limit=${encodeURIComponent(limit)}`),
    postSwipe: (profileId, action) => request('/swipe', { method: 'POST', body: { profileId, action } }),
    getMatches: () => request('/matches'),
  };
}

export const api = createApi({ baseUrl: import.meta.env?.VITE_API_BASE || '/api' });
