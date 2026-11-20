import { AnimatePresence } from 'framer-motion';
import SwipeCard from './SwipeCard.jsx';

/**
 * Renders the top card plus up to two faded cards behind it. Only the top card can be dragged.
 * AnimatePresence keeps a card mounted just long enough to play its exit animation after it
 * leaves the queue; `exitDirection` tells it which way to fly.
 */
export default function CardStack({ queue, canDrag, onSwipe, exitDirection, rollbackId }) {
  return (
    <div className="relative h-full w-full">
      <AnimatePresence initial={false} custom={exitDirection}>
        {queue.slice(0, 3).map((profile, index) => (
          <SwipeCard
            key={profile.id}
            profile={profile}
            index={index}
            canDrag={canDrag}
            onSwipe={onSwipe}
            exitDirection={exitDirection}
            isRollback={profile.id === rollbackId}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
