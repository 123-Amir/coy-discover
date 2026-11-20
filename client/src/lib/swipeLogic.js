// Pure gesture and keyboard rules. No React, no DOM: unit-tested in Node.

export const SWIPE_DISTANCE_PX = 110;     // dragged this far: commit
export const SWIPE_VELOCITY_PX_S = 520;   // flicked this fast...
export const MIN_FLICK_OFFSET_PX = 36;    // ...after at least this much movement: commit

/**
 * Decide what a finished drag means.
 * @param {number} offsetX   horizontal distance from where the card started
 * @param {number} velocityX horizontal release velocity in px/s
 * @returns {'like' | 'pass' | null}  null = not enough intent, spring the card back
 */
export function decideSwipe(offsetX, velocityX = 0) {
  if (!Number.isFinite(offsetX) || !Number.isFinite(velocityX)) return null;
  const direction = Math.sign(offsetX);
  if (direction === 0) return null;

  const distance = Math.abs(offsetX);
  const speed = Math.abs(velocityX);
  const movingWithDrag = Math.sign(velocityX) === direction;
  const movingAgainstDrag = Math.sign(velocityX) === -direction;

  const farEnough = distance >= SWIPE_DISTANCE_PX;
  const flicked = distance >= MIN_FLICK_OFFSET_PX && speed >= SWIPE_VELOCITY_PX_S && movingWithDrag;

  // A hard flick back toward the start cancels even a long drag.
  if (farEnough && speed >= SWIPE_VELOCITY_PX_S && movingAgainstDrag) return null;
  if (!farEnough && !flicked) return null;
  return direction > 0 ? 'like' : 'pass';
}

/** +1 = exits to the right (like), -1 = exits to the left (pass). */
export const exitDirection = (action) => (action === 'pass' ? -1 : 1);

/** Arrow keys swipe; any modifier key means the user is doing something else. */
export function actionForKey(event) {
  if (!event || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (event.key === 'ArrowRight') return 'like';
  if (event.key === 'ArrowLeft') return 'pass';
  return null;
}

/** Keyboard shortcuts must never fire while the user is typing or operating a control. */
export function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = String(el.tagName).toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}
