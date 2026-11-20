import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Cheap static checks that keep the non-negotiable rules from regressing silently.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const serviceFiles = fs.readdirSync(path.join(SRC, 'services')).filter((f) => f.endsWith('.js')).map((f) => `services/${f}`);
const dataLayerFiles = [...serviceFiles, 'db/seed.js', 'db/currentUser.js', 'serializers.js'];

describe('source guards', () => {
  it('finds the three services', () => {
    expect(serviceFiles.sort()).toEqual(['services/feedService.js', 'services/matchService.js', 'services/swipeService.js']);
  });

  it('never uses REPLACE (INSERT OR REPLACE / REPLACE INTO) for swipes or profiles', () => {
    for (const file of dataLayerFiles) {
      expect(/OR\s+REPLACE|REPLACE\s+INTO/i.test(stripComments(read(file)))).toBe(false);
    }
  });

  it('never builds SQL by string interpolation (parameterised queries only)', () => {
    for (const file of dataLayerFiles) {
      const templates = stripComments(read(file)).match(/`(?:[^`\\]|\\.)*`/g) ?? [];
      const bad = templates.filter((t) => t.includes('${') && /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(t));
      expect(bad).toEqual([]);
    }
  });

  it('never uses SELECT * (every returned column is chosen explicitly)', () => {
    for (const file of dataLayerFiles) expect(/SELECT\s+\*/i.test(stripComments(read(file)))).toBe(false);
  });

  it('keeps the service layer independent of Express and HTTP objects', () => {
    for (const file of [...serviceFiles, 'serializers.js', 'errors.js']) {
      const code = stripComments(read(file));
      expect(/from\s+['"]express['"]|require\(['"]express['"]\)/.test(code)).toBe(false);
      expect(/\b(req|res|next)\b/.test(code)).toBe(false);
    }
  });

  it('feedService never reads anyone\'s swipes toward the user, and matchService never reads swipes at all', () => {
    const feed = stripComments(read('services/feedService.js'));
    expect(/target_id\s*=\s*@me/i.test(feed)).toBe(false);
    expect(/swiper_id\s*=\s*@me/i.test(feed)).toBe(true);
    expect(/\bFROM\s+swipes\b/i.test(stripComments(read('services/matchService.js')))).toBe(false);
  });
});
