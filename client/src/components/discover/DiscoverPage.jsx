import { useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useDeck, useMe } from '../../state/hooks.js';
import { deckStore, meStore } from '../../state/stores.js';
import DiscoverHeader from './Header.jsx';
import SwipeView from './SwipeView.jsx';
import MatchesView from './MatchesView.jsx';
import MatchModal from './MatchModal.jsx';
import Toast from './Toast.jsx';

export default function DiscoverPage({ view, onNavigate }) {
  const deck = useDeck();
  const me = useMe();
  useEffect(() => { meStore.start(); }, []);

  // Looking at the matches clears the "new matches" badge.
  useEffect(() => {
    if (view === 'matches') deckStore.clearNewMatches();
  }, [view, deck.newMatchIds.length]);

  const dismissNotice = useCallback((id) => deckStore.dismissNotice(id), []);
  const goSwipe = useCallback(() => onNavigate('discover', 'swipe'), [onNavigate]);
  const goMatches = useCallback(() => onNavigate('discover', 'matches'), [onNavigate]);
  const keepSwiping = useCallback(() => deckStore.dismissMatch(), []);
  const viewMatches = useCallback(() => { deckStore.dismissMatch(); goMatches(); }, [goMatches]);

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 md:pb-5 md:pt-[5.6rem]">
      <DiscoverHeader view={view} onChange={(v) => onNavigate('discover', v)} me={me.data} newMatches={deck.newMatchIds.length} />

      <main className="relative flex min-h-0 flex-1 flex-col justify-center">
        {view === 'matches' ? <MatchesView onBackToSwipe={goSwipe} /> : <SwipeView onViewMatches={goMatches} />}
      </main>

      <Toast notice={deck.notice} onDismiss={dismissNotice} />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{deck.announcement}</div>

      <AnimatePresence>
        {deck.matchModal && (
          <MatchModal key={deck.matchModal.id} match={deck.matchModal} me={me.data} onKeepSwiping={keepSwiping} onViewMatches={viewMatches} />
        )}
      </AnimatePresence>
    </div>
  );
}
