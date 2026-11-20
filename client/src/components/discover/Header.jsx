import { motion } from 'framer-motion';

const VIEWS = [
  { id: 'swipe', label: 'Swipe' },
  { id: 'matches', label: 'Matches' },
];

export default function DiscoverHeader({ view, onChange, me, newMatches }) {
  return (
    <header className="flex items-center justify-between gap-3 pb-3 md:pb-3">
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-[1.9rem] font-semibold leading-none tracking-tight text-white">coy</span>
        <span className="eyebrow hidden sm:inline">discover</span>
      </div>

      <nav aria-label="Discover sections">
        <ul className="glass flex items-center gap-0.5 rounded-full p-1">
          {VIEWS.map(({ id, label }) => {
            const isActive = view === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onChange(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`focus-ring relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[0.82rem] font-medium transition-colors ${
                    isActive ? 'text-white' : 'text-mist-400 hover:text-mist-100'
                  }`}
                >
                  {isActive && <motion.span layoutId="seg-pill" className="seg-pill absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <span className="relative z-10">{label}</span>
                  {id === 'matches' && newMatches > 0 && <span className="badge relative z-10">{newMatches}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="size-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/20" title={me ? `Signed in as ${me.name}` : undefined}>
        {me?.photoUrl
          ? <img src={me.photoUrl} alt={`${me.name}, you`} draggable={false} className="size-full object-cover" />
          : <div className="photo-fallback size-full" aria-hidden="true" />}
      </div>
    </header>
  );
}
