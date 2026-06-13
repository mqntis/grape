import { describe, it, expect } from 'vitest';
import { computeDrift, driftMessage } from '../src/engine/drift';
import type { RewardEvent } from '../src/engine/types';

const makeEvent = (type: string, delta: number): RewardEvent => ({
  type, delta, label: type, reason: '', timestamp: Date.now(),
});

describe('computeDrift', () => {
  it('steady when no anti-patterns', () => {
    const events = [makeEvent('earlyBird', 8), makeEvent('pacedDay', 6)];
    expect(computeDrift(events).state).toBe('steady');
  });

  it('watch with 1 cram event', () => {
    const events = [makeEvent('cram', 0)];
    expect(computeDrift(events).state).toBe('watch');
  });

  it('strained with 3+ crams', () => {
    const events = [makeEvent('cram', 0), makeEvent('cram', 0), makeEvent('cram', 0)];
    expect(computeDrift(events).state).toBe('strained');
  });

  it('strained with 2+ overCap events', () => {
    const events = [makeEvent('overCap', 0), makeEvent('overCap', 0)];
    expect(computeDrift(events).state).toBe('strained');
  });
});

describe('driftMessage', () => {
  it('null for steady', () => expect(driftMessage('steady')).toBeNull());
  it('non-null for watch', () => expect(driftMessage('watch')).toBeTruthy());
  it('non-null for strained', () => expect(driftMessage('strained')).toBeTruthy());
});
