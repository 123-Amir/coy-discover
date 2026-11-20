import { motion } from 'framer-motion';
import { AlertIcon, CompassIcon, HeartIcon, RefreshIcon, SparkleIcon } from '../ui/icons.jsx';

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 }, transition: { duration: 0.35, ease: [0.22, 0.8, 0.3, 1] } };

/** Three stacked shimmering cards, matching the real deck's silhouette so nothing jumps on load. */
export function DeckSkeleton() {
  return (
    <div className="relative h-full w-full" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading profiles</span>
      {[2, 1, 0].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="skeleton card-surface absolute inset-0 rounded-[1.75rem]"
          style={{ transform: `translateY(${i * 16}px) scale(${1 - i * 0.05})`, opacity: 1 - i * 0.28, transformOrigin: '50% 100%' }}
        />
      ))}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 space-y-3 p-6">
        <div className="skeleton h-8 w-2/3 rounded-xl" />
        <div className="skeleton h-3.5 w-1/2 rounded-full" />
        <div className="skeleton h-3.5 w-5/6 rounded-full" />
      </div>
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, retrying = false }) {
  return (
    <motion.div {...fade} role="alert" className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-xs">
        <div className="glass mx-auto mb-5 grid size-16 place-items-center rounded-full text-coral-400"><AlertIcon size={28} /></div>
        <h2 className="font-display text-2xl text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist-300">{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} disabled={retrying} className="btn-primary focus-ring mt-6 disabled:opacity-60">
            <RefreshIcon size={16} /> {retrying ? 'Trying…' : 'Try again'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** Shown when every profile has been swiped. Points to matches, and lets the user check again. */
export function EmptyFeed({ onViewMatches, onRefresh }) {
  return (
    <motion.div {...fade} className="absolute inset-0 z-40 grid place-items-center px-4 text-center" data-testid="empty-feed">
      <div className="max-w-xs">
        <div className="relative mx-auto mb-7 size-28">
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-coral-500/20 blur-2xl" />
          <span aria-hidden="true" className="glass float-soft absolute left-0 top-3 grid size-16 place-items-center rounded-full text-coral-400"><HeartIcon size={26} filled /></span>
          <span aria-hidden="true" className="glass float-soft absolute bottom-0 right-0 grid size-14 place-items-center rounded-full text-glow-400" style={{ animationDelay: '-2s' }}><SparkleIcon size={22} filled /></span>
        </div>
        <h2 className="font-display text-[2rem] leading-tight text-white">You&rsquo;re all caught up</h2>
        <p className="mt-3 text-sm leading-relaxed text-mist-300">
          You&rsquo;ve seen everyone for now. New people show up as they join, and any mutual likes are waiting in your matches.
        </p>
        <div className="mt-7 flex flex-col items-stretch gap-3">
          <button type="button" onClick={onViewMatches} className="btn-primary focus-ring"><HeartIcon size={16} filled /> View matches</button>
          <button type="button" onClick={onRefresh} className="btn-ghost focus-ring"><RefreshIcon size={16} /> Check for new people</button>
        </div>
      </div>
    </motion.div>
  );
}

export function EmptyMatches({ onBack }) {
  return (
    <motion.div {...fade} className="grid h-full place-items-center px-6 text-center" data-testid="empty-matches">
      <div className="max-w-xs">
        <div className="relative mx-auto mb-7 size-24">
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-coral-500/15 blur-2xl" />
          <span aria-hidden="true" className="glass float-soft absolute inset-0 grid place-items-center rounded-full text-coral-400"><HeartIcon size={34} /></span>
        </div>
        <h2 className="font-display text-[2rem] leading-tight text-white">No matches yet</h2>
        <p className="mt-3 text-sm leading-relaxed text-mist-300">
          A match appears here only when you and someone else have both liked each other. Until then, nobody knows.
        </p>
        <button type="button" onClick={onBack} className="btn-primary focus-ring mt-7"><CompassIcon size={16} /> Start discovering</button>
      </div>
    </motion.div>
  );
}

export function MatchesSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      <span className="sr-only">Loading matches</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} aria-hidden="true" className="skeleton aspect-[3/4] rounded-3xl" />
      ))}
    </div>
  );
}
