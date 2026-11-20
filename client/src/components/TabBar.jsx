import { motion } from 'framer-motion';
import { CompassIcon, HomeIcon } from './ui/icons.jsx';

const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'discover', label: 'Discover', Icon: CompassIcon },
];

/** Floating pill: along the bottom on phones (thumb reach, safe-area aware), top-centre from md up. */
export default function TabBar({ active, badge = 0, onChange }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:inset-x-auto md:bottom-auto md:left-1/2 md:top-5 md:-translate-x-1/2 md:p-0"
    >
      <ul className="glass-strong mx-auto flex max-w-xs items-center gap-1 rounded-full p-1.5 md:max-w-none">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = id === active;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`focus-ring relative flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-colors md:px-7 ${
                  isActive ? 'text-white' : 'text-mist-400 hover:text-mist-100'
                }`}
              >
                {isActive && (
                  <motion.span layoutId="tab-pill" className="tab-pill absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Icon size={18} />
                  {label}
                  {id === 'discover' && badge > 0 && (
                    <span className="badge" aria-label={`${badge} new ${badge === 1 ? 'match' : 'matches'}`}>{badge}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
