import { describe, it, expect } from 'vitest';
import { allTasksDone, activeBlockedSites, canGrantUnlockWindow } from '../src/engine/gate';
import type { Assignment } from '../src/engine/types';

const task = (id: string, done: boolean): Assignment => ({
  id, title: id, type: 'homework', dueInDays: 1, calEst: 1, done,
});

const SITES = ['instagram.com', 'discord.com', 'youtube.com'];
const NOW = 1_000_000;

describe('allTasksDone', () => {
  it('false when AI mode is off', () => {
    expect(allTasksDone([task('a', true)], false)).toBe(false);
  });
  it('false when no tasks exist', () => {
    expect(allTasksDone([], true)).toBe(false);
  });
  it('false when a task is unfinished', () => {
    expect(allTasksDone([task('a', true), task('b', false)], true)).toBe(false);
  });
  it('true when AI mode is on and every task is done', () => {
    expect(allTasksDone([task('a', true), task('b', true)], true)).toBe(true);
  });
});

describe('activeBlockedSites', () => {
  it('blocks everything when tasks remain and nothing is unlocked', () => {
    expect(activeBlockedSites(SITES, {}, [task('a', false)], true, NOW)).toEqual(SITES);
  });

  it('unblocks all sites when every task is done', () => {
    expect(activeBlockedSites(SITES, {}, [task('a', true)], true, NOW)).toEqual([]);
  });

  it('respects an active unlock window across all sites', () => {
    const unlocked = { 'instagram.com': NOW + 5000, 'discord.com': NOW + 5000, 'youtube.com': NOW + 5000 };
    expect(activeBlockedSites(SITES, unlocked, [task('a', false)], true, NOW)).toEqual([]);
  });

  it('re-blocks a site once its window has expired', () => {
    const unlocked = { 'instagram.com': NOW - 1 };
    expect(activeBlockedSites(SITES, unlocked, [task('a', false)], true, NOW)).toEqual(SITES);
  });

  it('in manual mode, all-done does not unblock (coins gate instead)', () => {
    expect(activeBlockedSites(SITES, {}, [task('a', true)], false, NOW)).toEqual(SITES);
  });
});

describe('canGrantUnlockWindow', () => {
  it('grants when no window is active', () => {
    expect(canGrantUnlockWindow({}, NOW)).toBe(true);
  });
  it('does not stack while a window is active', () => {
    expect(canGrantUnlockWindow({ 'youtube.com': NOW + 1000 }, NOW)).toBe(false);
  });
  it('grants again after the window expired', () => {
    expect(canGrantUnlockWindow({ 'youtube.com': NOW - 1000 }, NOW)).toBe(true);
  });
});
