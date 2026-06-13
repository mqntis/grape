import type { DriftResult, DriftState, RewardEvent } from './types.js';

export const SUPPORT_LINK = 'https://www.crisistextline.org/';
export const STRAINED_MESSAGE =
  'Your recent pattern suggests you\'re carrying a heavy load. Consider lightening next week or talking to someone.';

export function computeDrift(recentEvents: RewardEvent[]): DriftResult {
  const cramCount = recentEvents.filter(e => e.type === 'cram').length;
  const lateNightCount = recentEvents.filter(e => e.type === 'lateNight').length;
  const backlog = recentEvents.filter(e => e.type === 'overCap').length;

  let state: DriftState = 'steady';
  if (cramCount >= 3 || lateNightCount >= 3 || backlog >= 2) state = 'strained';
  else if (cramCount >= 1 || lateNightCount >= 1 || backlog >= 1) state = 'watch';

  return { state, cramCount, lateNightCount, backlog };
}

export function driftMessage(state: DriftState): string | null {
  if (state === 'strained') return STRAINED_MESSAGE;
  if (state === 'watch') return 'You\'ve had a few rough days. Keep an eye on your pace.';
  return null;
}
