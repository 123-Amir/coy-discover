import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useMatches } from '../../state/hooks.js';
import { matchesStore } from '../../state/stores.js';
import { formatMatchedAt, plural } from '../../lib/format.js';
import ProfilePhoto from '../ui/ProfilePhoto.jsx';
import { CapIcon, HeartIcon, PinIcon } from '../ui/icons.jsx';
import { EmptyMatches, ErrorState, MatchesSkeleton } from './states.jsx';

function MatchTile({ match, index }) {
  const { profile } = match;
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.045, duration: 0.4, ease: [0.22, 0.8, 0.3, 1] }}
    >
      <article className="card-surface group relative aspect-[3/4] overflow-hidden rounded-3xl" aria-label={`${profile.name}, ${profile.age}, matched ${formatMatchedAt(match.matchedAt)}`}>
        <ProfilePhoto profile={profile} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-105" />
        <div className="photo-scrim absolute inset-0" />
        <span className="glass absolute right-3 top-3 grid size-8 place-items-center rounded-full text-coral-400" aria-hidden="true">
          <HeartIcon size={15} filled />
        </span>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="font-display text-xl font-semibold leading-tight text-white">
            {profile.name}<span className="ml-1.5 font-sans text-base font-light text-mist-200">{profile.age}</span>
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-mist-200"><PinIcon size={12} className="shrink-0 text-coral-400" /><span className="truncate">{profile.city}</span></p>
          {profile.college && (
            <p className="mt-0.5 hidden items-center gap-1.5 text-xs text-mist-300 sm:flex"><CapIcon size={12} className="shrink-0 text-coral-400" /><span className="truncate">{profile.college}</span></p>
          )}
          <p className="mt-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-mist-400">Matched {formatMatchedAt(match.matchedAt).toLowerCase()}</p>
        </div>
      </article>
    </motion.li>
  );
}

export default function MatchesView({ onBackToSwipe }) {
  const { status, data, error, refreshing } = useMatches();
  useEffect(() => { matchesStore.load(); }, []);

  if (status === 'idle' || status === 'loading') return <MatchesSkeleton />;
  if (status === 'error') {
    return <ErrorState title="Couldn’t load your matches" message={error?.message} onRetry={() => matchesStore.load()} retrying={refreshing} />;
  }
  const matches = data ?? [];
  if (matches.length === 0) return <EmptyMatches onBack={onBackToSwipe} />;

  return (
    <div className="no-scrollbar fade-edge h-full overflow-y-auto pb-8" data-testid="matches-list">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="font-display text-[2rem] leading-none text-white">Your matches</h2>
        <p className="text-sm text-mist-400">{matches.length} mutual {plural(matches.length, 'like')}</p>
      </div>
      {error && (
        <p role="status" className="glass mb-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm text-mist-200">
          <span>Couldn&rsquo;t refresh. Showing your last known matches.</span>
          <button type="button" onClick={() => matchesStore.load()} className="focus-ring rounded-full px-2 font-semibold text-coral-300">Retry</button>
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {matches.map((m, i) => <MatchTile key={m.id} match={m} index={i} />)}
      </ul>
    </div>
  );
}
