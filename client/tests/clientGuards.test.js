import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static guards for the frontend promises: no mock matching, nothing about incoming likes.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(SRC).filter((f) => /\.(jsx?|css)$/.test(f));
const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
// Same, but also blank out string and template literals: for rules about *code*, not display text.
const codeOnly = (code) => strip(code).replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
const read = (f) => strip(fs.readFileSync(f, 'utf8'));
const rel = (f) => path.relative(SRC, f).replaceAll(path.sep, '/');

describe('frontend source guards', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('never mentions incoming-like concepts (the UI cannot show what it is never given)', () => {
    for (const f of files) {
      const code = read(f);
      for (const word of ['likedYou', 'likesYou', 'likedMe', 'incomingLike', 'admirer', 'likesCurrentUser', 'whoLiked']) {
        expect(`${rel(f)}:${code.includes(word)}`).toBe(`${rel(f)}:false`);
      }
    }
  });

  it('has no client-side match logic: `matched` is only ever read from a server result', () => {
    const offenders = files.filter((f) => /\.jsx?$/.test(f) && /\bmatched\b/.test(codeOnly(fs.readFileSync(f, 'utf8'))) && !rel(f).endsWith('deckStore.js'));
    expect(offenders.map(rel)).toEqual([]);
    const deck = read(path.join(SRC, 'state/deckStore.js'));
    expect(/result\??\.matched === true/.test(deck)).toBe(true);
  });

  it('never opens the match modal from anything but the swipe response', () => {
    const deck = read(path.join(SRC, 'state/deckStore.js'));
    const assignments = (deck.match(/matchModal:\s*[^,}\n]+/g) ?? []).map((a) => a.trim());
    // initial state, the success path (the server's match), and the explicit dismissal
    expect(assignments.sort()).toEqual(['matchModal: match', 'matchModal: null', 'matchModal: null']);
  });

  it('keeps Home completely blank: no text, data, or stores', () => {
    const home = read(path.join(SRC, 'components/HomePage.jsx'));
    expect(/import .*(state|api)/.test(home)).toBe(false);
    expect(/>\s*[A-Za-z][^<{]*</.test(home.replace(/aria-label="[^"]*"/g, ''))).toBe(false);
  });

  it('only the api client talks to the network', () => {
    for (const f of files.filter((x) => /\.jsx?$/.test(x))) {
      if (rel(f) === 'api/client.js') continue;
      expect(`${rel(f)}:${/\bfetch\s*\(/.test(read(f))}`).toBe(`${rel(f)}:false`);
    }
  });

  it('never loads fonts, images or scripts from a third-party host', () => {
    for (const f of files) expect(`${rel(f)}:${/https?:\/\/(?!www\.w3\.org)/.test(read(f))}`).toBe(`${rel(f)}:false`);
  });
});
