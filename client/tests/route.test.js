import { describe, it, expect } from 'vitest';
import { parseHash, hashFor } from '../src/lib/route.js';

describe('route', () => {
  it('parses the three views and defaults to Discover', () => {
    expect(parseHash('#home')).toEqual({ tab: 'home', view: 'swipe' });
    expect(parseHash('#discover')).toEqual({ tab: 'discover', view: 'swipe' });
    expect(parseHash('#discover/matches')).toEqual({ tab: 'discover', view: 'matches' });
    expect(parseHash('')).toEqual({ tab: 'discover', view: 'swipe' });
    expect(parseHash('#/home')).toEqual({ tab: 'home', view: 'swipe' });
    expect(parseHash('#nonsense')).toEqual({ tab: 'discover', view: 'swipe' });
    expect(parseHash(undefined)).toEqual({ tab: 'discover', view: 'swipe' });
  });
  it('round-trips', () => {
    for (const [tab, view] of [['home', 'swipe'], ['discover', 'swipe'], ['discover', 'matches']]) {
      expect(parseHash(hashFor(tab, view))).toEqual({ tab, view });
    }
  });
});
