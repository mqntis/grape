import type { Assignment } from './types';

// Pure decision logic for the AI focus-gate. Kept free of chrome APIs so it can be tested.

// True when Focus Gate is on and every task is finished — earns a fully unblocked state.
export function allTasksDone(assignments: Assignment[], aiModeEnabled: boolean): boolean {
  return aiModeEnabled && assignments.length > 0 && assignments.every(a => a.done);
}

// A domain counts as unlocked while its expiry is still in the future.
function isUnlocked(unblockedSites: Record<string, number>, domain: string, now: number): boolean {
  const expiry = unblockedSites[domain.trim().toLowerCase()];
  return typeof expiry === 'number' && expiry > now;
}

// The domains that should still redirect to the block page right now.
export function activeBlockedSites(
  blockedSites: string[],
  unblockedSites: Record<string, number>,
  assignments: Assignment[],
  aiModeEnabled: boolean,
  now: number = Date.now()
): string[] {
  if (allTasksDone(assignments, aiModeEnabled)) return [];
  return blockedSites.filter(site => !isUnlocked(unblockedSites, site, now));
}

// One window per task: a completion only opens a new 10-min window when none is active.
export function canGrantUnlockWindow(unblockedSites: Record<string, number>, now: number = Date.now()): boolean {
  return !Object.values(unblockedSites).some(expiry => expiry > now);
}
