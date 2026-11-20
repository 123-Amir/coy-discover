import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useDeck } from '../../state/hooks.js';
import { deckStore } from '../../state/stores.js';
import { canSwipe } from '../../state/deckStore.js';
import { actionForKey, exitDirection, isTypingTarget } from '../../lib/swipeLogic.js';
import CardStack from './CardStack.jsx';
import ActionButtons from './ActionButtons.jsx';
import { DeckSkeleton, EmptyFeed, ErrorState } from './states.jsx';

/** Arrow keys swipe (desktop). Ignored while typing, with modifiers, or when a key is held down. */
function useKeyboardSwipe(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    function onKeyDown(event) {
      if (event.repeat || isTypingTarget(event.target)) return;
      const action = actionForKey(event);
      if (action) {
        event.preventDefault();
        deckStore.swipe(action);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

export default function SwipeView({ onViewMatches }) {
  const deck = useDeck();
  useEffect(() => { deckStore.start(); }, []);

  const swipeable = canSwipe(deck);
  useKeyboardSwipe(swipeable);

  if (deck.status === 'error') {
    return <ErrorState title="Couldn’t load profiles" message={deck.error?.message} onRetry={() => deckStore.refresh()} />;
  }

  const loading = deck.status === 'loading' || (deck.queue.length === 0 && !deck.exhausted && !deck.inFlight);
  const empty = deck.status === 'ready' && deck.queue.length === 0 && deck.exhausted && !deck.inFlight;
  const topName = deck.queue[0]?.name ?? deck.inFlight?.profile.name;

  return (
    <div className="mx-auto flex h-full max-h-[54rem] w-full max-w-[26rem] flex-col md:max-w-[28rem]">
      <div className="relative min-h-0 flex-1 pb-8" data-testid="stage">
        {loading ? (
          <DeckSkeleton />
        ) : (
          <CardStack
            queue={deck.queue}
            canDrag={swipeable}
            onSwipe={(action) => deckStore.swipe(action)}
            exitDirection={exitDirection(deck.lastAction)}
            rollbackId={deck.rollbackId}
          />
        )}
        <AnimatePresence>
          {empty && <EmptyFeed key="empty" onViewMatches={onViewMatches} onRefresh={() => deckStore.refresh()} />}
        </AnimatePresence>
      </div>
      {!empty && (
        <ActionButtons
          disabled={!swipeable}
          name={topName}
          onPass={() => deckStore.swipe('pass')}
          onLike={() => deckStore.swipe('like')}
        />
      )}
    </div>
  );
}
