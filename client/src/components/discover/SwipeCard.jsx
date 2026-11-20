import { motion, animate, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { decideSwipe } from '../../lib/swipeLogic.js';
import ProfilePhoto from '../ui/ProfilePhoto.jsx';
import { CapIcon, PinIcon } from '../ui/icons.jsx';

// Where each card sits in the stack (0 = top). Cards behind are smaller, lower and fainter.
const STACK = [
  { scale: 1, y: 0, opacity: 1 },
  { scale: 0.95, y: 16, opacity: 0.92 },
  { scale: 0.9, y: 32, opacity: 0.7 },
];

// The card leaves in the direction of the last swipe (also for button-initiated swipes).
// Rotation and the LIKE/PASS stamps are derived from x, so they follow along during the exit.
const cardVariants = {
  exit: (direction) => ({
    x: direction * 720,
    opacity: 0,
    transition: { duration: 0.42, ease: [0.22, 0.8, 0.3, 1] },
  }),
};

export default function SwipeCard({ profile, index, canDrag, onSwipe, exitDirection, isRollback }) {
  const isTop = index === 0;
  const reduceMotion = useReducedMotion();

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-720, -260, 0, 260, 720], reduceMotion ? [0, 0, 0, 0, 0] : [-22, -11, 0, 11, 22]);
  const likeOpacity = useTransform(x, [24, 120], [0, 1]);
  const likeScale = useTransform(x, [24, 120], [0.85, 1]);
  const passOpacity = useTransform(x, [-120, -24], [1, 0]);
  const passScale = useTransform(x, [-120, -24], [1, 0.85]);

  const draggable = isTop && canDrag;

  function handleDragEnd(_event, info) {
    const action = decideSwipe(info.offset.x, info.velocity.x);
    // onSwipe returns false if the swipe was refused (request in flight, modal open...):
    // either way, if it was not accepted the card springs back to centre.
    const accepted = action ? onSwipe(action) : false;
    if (!accepted) animate(x, 0, { type: 'spring', stiffness: 460, damping: 36 });
  }

  const { name, age, city, college, bio, interests } = profile;

  return (
    <motion.article
      aria-hidden={!isTop}
      aria-label={isTop ? `${name}, ${age}` : undefined}
      data-testid={isTop ? 'top-card' : undefined}
      className={`card-surface absolute inset-0 touch-pan-y select-none overflow-hidden rounded-[1.75rem] ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ x, rotate: isTop ? rotate : 0, zIndex: 30 - index * 10, transformOrigin: '50% 100%' }}
      variants={cardVariants}
      custom={exitDirection}
      initial={isRollback ? { opacity: 0, scale: 0.94, y: 24 } : false}
      animate={STACK[index] ?? STACK[2]}
      exit="exit"
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      drag={draggable ? 'x' : false}
      dragMomentum={false}
      whileDrag={{ scale: 1.02 }}
      onDragEnd={handleDragEnd}
    >
      <ProfilePhoto profile={profile} className="absolute inset-0 h-full w-full" />
      <div className="photo-vignette absolute inset-0" />
      <div className="photo-scrim absolute inset-0" />
      {!isTop && <div aria-hidden="true" className="absolute inset-0 bg-ink-950/45" />}

      {isTop && (
        <>
          <motion.div aria-hidden="true" style={{ opacity: likeOpacity }} className="like-tint pointer-events-none absolute inset-0" />
          <motion.div aria-hidden="true" style={{ opacity: passOpacity }} className="pass-tint pointer-events-none absolute inset-0" />
          <motion.div aria-hidden="true" style={{ opacity: likeOpacity, scale: likeScale }} className="pointer-events-none absolute left-5 top-6">
            <span className="stamp stamp-like">Like</span>
          </motion.div>
          <motion.div aria-hidden="true" style={{ opacity: passOpacity, scale: passScale }} className="pointer-events-none absolute right-5 top-6">
            <span className="stamp stamp-pass">Pass</span>
          </motion.div>
        </>
      )}

      {/* Cards behind the top one show only their photo; the text fades in when the card is promoted. */}
      <div className={`absolute inset-x-0 bottom-0 p-5 transition-opacity duration-300 sm:p-6 ${isTop ? 'opacity-100' : 'opacity-0'}`}>
        <h2 className="font-display text-[2.1rem] font-semibold leading-none tracking-tight text-white">
          {name}
          <span className="ml-2.5 font-sans text-[1.55rem] font-light text-mist-200">{age}</span>
        </h2>

        <ul className="mt-3 space-y-1 text-[0.82rem] text-mist-200">
          <li className="flex items-center gap-2"><PinIcon size={14} className="shrink-0 text-coral-400" /><span className="truncate">{city}</span></li>
          {college && (
            <li className="flex items-center gap-2"><CapIcon size={14} className="shrink-0 text-coral-400" /><span className="truncate">{college}</span></li>
          )}
        </ul>

        <p className="mt-3 line-clamp-3 text-[0.95rem] leading-relaxed text-mist-100/90">{bio}</p>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Interests">
          {interests.slice(0, 4).map((interest) => (
            <li key={interest} className="chip">{interest}</li>
          ))}
        </ul>
      </div>
    </motion.article>
  );
}
