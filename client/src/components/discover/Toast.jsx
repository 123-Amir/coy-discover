import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertIcon } from '../ui/icons.jsx';

/** A transient message (failed swipe, or "already decided"). Errors are announced assertively. */
export default function Toast({ notice, onDismiss }) {
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => onDismiss(notice.id), 5000);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-8">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            role={notice.kind === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="glass-strong pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-sm text-mist-100"
          >
            <AlertIcon size={18} className={`mt-0.5 shrink-0 ${notice.kind === 'error' ? 'text-coral-400' : 'text-glow-400'}`} />
            <p className="flex-1 leading-snug">{notice.message}</p>
            <button type="button" onClick={() => onDismiss(notice.id)} aria-label="Dismiss message" className="focus-ring -mr-1 rounded-full px-1.5 text-mist-400 hover:text-white">
              &times;
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
