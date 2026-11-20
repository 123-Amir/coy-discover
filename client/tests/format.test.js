import { describe, it, expect } from 'vitest';
import { formatMatchedAt, initialsOf, plural } from '../src/lib/format.js';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('formatMatchedAt', () => {
  it('formats recent times relatively', () => {
    expect(formatMatchedAt(ago(5_000), NOW)).toBe('Just now');
    expect(formatMatchedAt(ago(59_000), NOW)).toBe('Just now');
    expect(formatMatchedAt(ago(5 * 60_000), NOW)).toBe('5m ago');
    expect(formatMatchedAt(ago(3 * 3_600_000), NOW)).toBe('3h ago');
    expect(formatMatchedAt(ago(30 * 3_600_000), NOW)).toBe('Yesterday');
    expect(formatMatchedAt(ago(4 * 86_400_000), NOW)).toBe('4d ago');
  });
  it('falls back to a short date after a week', () => {
    expect(formatMatchedAt(ago(20 * 86_400_000), NOW).length).toBeGreaterThan(3);
  });
  it('never goes negative for clock skew, and tolerates garbage', () => {
    expect(formatMatchedAt(new Date(NOW + 60_000).toISOString(), NOW)).toBe('Just now');
    expect(formatMatchedAt('not a date', NOW)).toBe('');
    expect(formatMatchedAt(undefined, NOW)).toBe('');
  });
});

describe('initialsOf / plural', () => {
  it('builds up to two uppercase initials', () => {
    expect(initialsOf('ananya')).toBe('A');
    expect(initialsOf('Aarav Nair')).toBe('AN');
    expect(initialsOf('  mary  jane  watson ')).toBe('MJ');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });
  it('pluralises', () => {
    expect(plural(1, 'match', 'matches')).toBe('match');
    expect(plural(2, 'match', 'matches')).toBe('matches');
    expect(plural(0, 'like')).toBe('likes');
  });
});
