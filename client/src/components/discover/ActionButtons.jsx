import { motion } from 'framer-motion';
import { CloseIcon, HeartIcon, LockIcon } from '../ui/icons.jsx';

export default function ActionButtons({ disabled, name, onPass, onLike }) {
  const who = name ? ` ${name}` : '';
  return (
    <div className="pt-3 md:pt-3">
      <div className="flex items-start justify-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <motion.button
            type="button"
            disabled={disabled}
            onClick={onPass}
            aria-label={`Pass on${who}`}
            whileTap={disabled ? undefined : { scale: 0.9 }}
            whileHover={disabled ? undefined : { scale: 1.06 }}
            className="btn-round btn-pass focus-ring size-[3.6rem] md:size-16"
          >
            <CloseIcon size={26} strokeWidth={2.4} />
          </motion.button>
          <span className="text-xs font-medium tracking-wide text-mist-400">Pass</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <motion.button
            type="button"
            disabled={disabled}
            onClick={onLike}
            aria-label={`Like${who}`}
            whileTap={disabled ? undefined : { scale: 0.9 }}
            whileHover={disabled ? undefined : { scale: 1.06 }}
            className="btn-round btn-like focus-ring size-[3.6rem] md:size-16"
          >
            <HeartIcon size={26} filled strokeWidth={2} />
          </motion.button>
          <span className="text-xs font-medium tracking-wide text-mist-400">Like</span>
        </div>
      </div>

      <p className="mt-3 hidden items-center justify-center gap-2 text-[0.72rem] text-mist-500 md:flex">
        <kbd className="rounded-md border border-white/15 px-1.5 py-0.5 font-sans text-[0.7rem] text-mist-300">←</kbd> pass
        <span aria-hidden="true">·</span>
        <kbd className="rounded-md border border-white/15 px-1.5 py-0.5 font-sans text-[0.7rem] text-mist-300">→</kbd> like
      </p>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[0.72rem] text-mist-500 md:mt-1">
        <LockIcon size={12} /> Likes stay private until it&rsquo;s mutual.
      </p>
    </div>
  );
}
