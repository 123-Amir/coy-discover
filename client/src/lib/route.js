// Tiny hash router: refresh keeps you on the same tab and sub-view. Pure functions.
// '#home' | '#discover' | '#discover/matches'  (anything else falls back to Discover)

export function parseHash(hash = '') {
  const value = String(hash).replace(/^#\/?/, '');
  if (value === 'home') return { tab: 'home', view: 'swipe' };
  if (value === 'discover/matches') return { tab: 'discover', view: 'matches' };
  return { tab: 'discover', view: 'swipe' };
}

export function hashFor(tab, view = 'swipe') {
  if (tab === 'home') return '#home';
  return view === 'matches' ? '#discover/matches' : '#discover';
}
