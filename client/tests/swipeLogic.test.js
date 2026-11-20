import { describe, it, expect } from 'vitest';
import { decideSwipe, actionForKey, isTypingTarget, exitDirection, SWIPE_DISTANCE_PX, SWIPE_VELOCITY_PX_S } from '../src/lib/swipeLogic.js';

describe('decideSwipe', () => {
  it('likes on a long right drag and passes on a long left drag', () => {
    expect(decideSwipe(SWIPE_DISTANCE_PX, 0)).toBe('like');
    expect(decideSwipe(250, 0)).toBe('like');
    expect(decideSwipe(-SWIPE_DISTANCE_PX, 0)).toBe('pass');
    expect(decideSwipe(-250, 0)).toBe('pass');
  });

  it('does nothing for a short, slow drag', () => {
    expect(decideSwipe(SWIPE_DISTANCE_PX - 1, 0)).toBeNull();
    expect(decideSwipe(-(SWIPE_DISTANCE_PX - 1), 100)).toBeNull();
    expect(decideSwipe(0, 0)).toBeNull();
  });

  it('commits a short drag that is released with a fast flick in the same direction', () => {
    expect(decideSwipe(50, SWIPE_VELOCITY_PX_S)).toBe('like');
    expect(decideSwipe(-50, -SWIPE_VELOCITY_PX_S)).toBe('pass');
  });

  it('ignores a flick after only a tiny movement, or against the drag direction', () => {
    expect(decideSwipe(10, 2000)).toBeNull();
    expect(decideSwipe(60, -2000)).toBeNull();
    expect(decideSwipe(-60, 2000)).toBeNull();
  });

  it('cancels a long drag that ends with a hard flick back', () => {
    expect(decideSwipe(200, -1500)).toBeNull();
    expect(decideSwipe(-200, 1500)).toBeNull();
    expect(decideSwipe(200, -100)).toBe('like');   // a gentle drift back does not cancel
  });

  it('rejects non-finite input', () => {
    expect(decideSwipe(NaN, 0)).toBeNull();
    expect(decideSwipe(200, NaN)).toBeNull();
    expect(decideSwipe(Infinity, 0)).toBeNull();
    expect(decideSwipe(undefined, 0)).toBeNull();
  });
});

describe('exitDirection', () => {
  it('exits right for like and left for pass', () => {
    expect(exitDirection('like')).toBe(1);
    expect(exitDirection('pass')).toBe(-1);
  });
});

describe('actionForKey', () => {
  it('maps the arrow keys', () => {
    expect(actionForKey({ key: 'ArrowRight' })).toBe('like');
    expect(actionForKey({ key: 'ArrowLeft' })).toBe('pass');
  });
  it('ignores other keys and any modifier combination', () => {
    expect(actionForKey({ key: 'ArrowUp' })).toBeNull();
    expect(actionForKey({ key: 'Enter' })).toBeNull();
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(actionForKey({ key: 'ArrowRight', [mod]: true })).toBeNull();
    }
    expect(actionForKey(null)).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('is true for form fields and editable content only', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
