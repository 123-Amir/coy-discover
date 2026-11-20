import { describe, it, expect } from 'vitest';
import { AppError } from '../src/errors.js';
import { notFound, errorHandler } from '../src/middleware/errorHandler.js';

// Unit tests with fake req/res objects: no HTTP, no Express.
function run(err, { headersSent = false } = {}) {
  const out = { status: null, body: null, next: undefined, nextCalled: false, logged: [] };
  const res = {
    headersSent,
    status(code) { out.status = code; return res; },
    json(body) { out.body = body; return res; },
  };
  const logger = { error: (...args) => out.logged.push(args) };
  errorHandler(logger)(err, { method: 'POST', originalUrl: '/api/swipe' }, res, (e) => { out.nextCalled = true; out.next = e; });
  return out;
}

describe('errorHandler', () => {
  it('maps an AppError to its status and code, without logging it', () => {
    const out = run(new AppError(409, 'ALREADY_SWIPED', 'You have already swiped on this profile'));
    expect(out.status).toBe(409);
    expect(out.body).toEqual({ error: { code: 'ALREADY_SWIPED', message: 'You have already swiped on this profile' } });
    expect(out.logged).toHaveLength(0);
  });

  it('maps a JSON parse failure from the body parser to 400 INVALID_BODY', () => {
    const err = Object.assign(new SyntaxError('Unexpected token } in JSON at position 9'), { type: 'entity.parse.failed', status: 400 });
    const out = run(err);
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' } });
    expect(JSON.stringify(out.body).includes('Unexpected token')).toBe(false);
  });

  it('maps an oversized body to 413 PAYLOAD_TOO_LARGE', () => {
    const out = run(Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 }));
    expect(out.status).toBe(413);
    expect(out.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps any other 4xx from middleware to a generic BAD_REQUEST with a fixed message', () => {
    const out = run(Object.assign(new Error('unsupported charset "UTF-1337"'), { status: 415, type: 'charset.unsupported' }));
    expect(out.status).toBe(415);
    expect(out.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'The request could not be processed' } });
  });

  it('turns unexpected errors into a generic 500, logging the real error server-side only', () => {
    const err = new Error('SQLITE_ERROR: no such table: swipes at /srv/app/db.js:42');
    const out = run(err);
    expect(out.status).toBe(500);
    expect(out.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    expect(out.logged).toHaveLength(1);
    expect(out.logged[0]).toContain(err);
  });

  it('treats a 5xx status on an error as an internal error, not as something to expose', () => {
    const out = run(Object.assign(new Error('upstream exploded'), { status: 503 }));
    expect(out.status).toBe(500);
    expect(out.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('survives non-Error throwables without crashing', () => {
    for (const thrown of ['a string', 42, null, undefined, { weird: true }]) {
      const out = run(thrown);
      expect(out.status).toBe(500);
      expect(out.body.error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('delegates to the next handler if the response has already started', () => {
    const err = new Error('too late');
    const out = run(err, { headersSent: true });
    expect(out.nextCalled).toBe(true);
    expect(out.next).toBe(err);
    expect(out.status).toBeNull();
    expect(out.body).toBeNull();
  });
});

describe('notFound', () => {
  it('responds 404 NOT_FOUND with a fixed message', () => {
    let status, body;
    const res = { status(c) { status = c; return res; }, json(b) { body = b; return res; } };
    notFound({ method: 'GET', originalUrl: '/anything?x=<script>' }, res);
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
});
