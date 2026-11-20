import { useEffect, useId, useRef } from 'react';
import { motion } from 'framer-motion';
import ProfilePhoto from '../ui/ProfilePhoto.jsx';
import { HeartIcon } from '../ui/icons.jsx';

// Fixed positions so the celebration is the same every time (no Math.random during render).
const SPARKS = [
  { left: '8%', dur: '4.2s', delay: '0s', size: 14 }, { left: '19%', dur: '5.1s', delay: '0.6s', size: 10 },
  { left: '31%', dur: '3.8s', delay: '1.4s', size: 16 }, { left: '44%', dur: '4.6s', delay: '0.2s', size: 12 },
  { left: '57%', dur: '5.4s', delay: '1.1s', size: 15 }, { left: '69%', dur: '4.0s', delay: '0.8s', size: 11 },
  { left: '81%', dur: '4.9s', delay: '1.8s', size: 14 }, { left: '92%', dur: '3.9s', delay: '0.4s', size: 10 },
];

/**
 * "It's a match!" celebration. Rendered ONLY from the server's matched:true response (see deckStore).
 * Accessible dialog: labelled, focus moves in and is restored on close, Tab is trapped, Esc closes.
 */
export default function MatchModal({ match, me, onKeepSwiping, onViewMatches }) {
  const titleId = useId();
  const descId = useId();
  const primaryRef = useRef(null);
  const secondaryRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    primaryRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onKeepSwiping();
        return;
      }
      if (event.key !== 'Tab') return;
      const first = primaryRef.current;
      const last = secondaryRef.current;
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeepSwiping]);

  const { profile } = match;
  const you = me ?? { name: 'You', photoUrl: null };

  return (
    <motion.div
      className="fixed inset-0 z-[55] grid place-items-center p-5"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      data-testid="match-modal"
    >
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-md" onClick={onKeepSwiping} aria-hidden="true" />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="match-sheet relative w-full max-w-sm overflow-hidden rounded-[2rem] px-7 pb-7 pt-9 text-center"
        initial={{ y: 40, scale: 0.94, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, scale: 0.97, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-3/5 overflow-hidden">
          {SPARKS.map((spark, i) => (
            <span key={i} className="spark" style={{ left: spark.left, '--dur': spark.dur, '--delay': spark.delay }}>
              <HeartIcon filled size={spark.size} />
            </span>
          ))}
        </div>

        <p className="eyebrow relative">Mutual like</p>
        <h2 id={titleId} className="text-gradient relative mt-2 font-display text-[2.8rem] font-semibold leading-none tracking-tight">
          It&rsquo;s a match!
        </h2>

        <div className="relative mx-auto mt-8 flex w-fit items-center">
          <div className="match-avatar size-[6.5rem] -rotate-6">
            <ProfilePhoto profile={you} className="h-full w-full" />
          </div>
          <div className="match-avatar -ml-5 size-[6.5rem] rotate-6">
            <ProfilePhoto profile={profile} className="h-full w-full" />
          </div>
          <span className="match-heart absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white">
            <HeartIcon size={18} filled />
          </span>
        </div>

        <p id={descId} className="relative mt-7 text-[0.95rem] leading-relaxed text-mist-200">
          You and <strong className="font-semibold text-white">{profile.name}</strong> liked each other.
        </p>

        <div className="relative mt-7 flex flex-col gap-3">
          <button ref={primaryRef} type="button" onClick={onViewMatches} className="btn-primary focus-ring">
            View matches
          </button>
          <button ref={secondaryRef} type="button" onClick={onKeepSwiping} className="btn-ghost focus-ring">
            Keep swiping
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
