import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static checks that keep the HTTP layer thin: routes call services and contain no business logic.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const list = (dir) => fs.readdirSync(path.join(SRC, dir)).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);
const httpFiles = [...list('routes'), ...list('middleware'), 'app.js'];

describe('HTTP layer source guards', () => {
  it('has a route file for each resource', () => {
    expect(list('routes').sort()).toEqual(['routes/feed.js', 'routes/index.js', 'routes/matches.js', 'routes/me.js', 'routes/swipe.js']);
  });

  it('contains no SQL and never touches the database directly (routes delegate to services)', () => {
    for (const file of httpFiles.filter((f) => f !== 'app.js' && f !== 'middleware/currentUser.js')) {
      const code = stripComments(read(file));
      expect(/\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(code)).toBe(false);
      expect(/\.prepare\(|\.exec\(|\.transaction\(/.test(code)).toBe(false);
      expect(/better-sqlite3/.test(code)).toBe(false);
    }
  });

  it('routes call the Phase 2 services', () => {
    expect(/getFeed/.test(read('routes/feed.js'))).toBe(true);
    expect(/swipe\(/.test(read('routes/swipe.js'))).toBe(true);
    expect(/listMatches/.test(read('routes/matches.js'))).toBe(true);
    expect(/getCurrentUserProfile/.test(read('routes/me.js'))).toBe(true);
  });

  it('never takes the acting user from the request (always req.userId set by middleware)', () => {
    for (const file of httpFiles) {
      const code = stripComments(read(file));
      expect(/req\.(body|query|headers|params|get\(|header\()[^;]*?(user|swiper)/i.test(code)).toBe(false);
    }
    expect(/req\.userId/.test(read('routes/swipe.js'))).toBe(true);
  });

  it('never sends an unexpected error\'s message or stack to the client', () => {
    const code = stripComments(read('middleware/errorHandler.js'));
    // Everything from the logging call onward is the unexpected-error path: it may log `err`,
    // but must not read err.message / err.stack into the response.
    const unexpectedPath = code.slice(code.indexOf('logger.error'));
    expect(/err\??\.(message|stack)/.test(unexpectedPath)).toBe(false);
    expect(/INTERNAL_ERROR/.test(unexpectedPath)).toBe(true);
    // The only place err.message is forwarded is the AppError branch, whose messages are authored in the services.
    const beforeLogging = code.slice(0, code.indexOf('logger.error'));
    expect(beforeLogging.match(/err\.message/g)).toHaveLength(1);
  });

  it('keeps Express out of the service layer', () => {
    for (const file of list('services')) expect(/express/.test(stripComments(read(file)))).toBe(false);
  });
});
