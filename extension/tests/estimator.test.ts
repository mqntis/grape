import { describe, it, expect } from 'vitest';
import { calcEst, calibrate, roundToHalf, DEFAULT_MULTIPLIERS } from '../src/engine/estimator';

describe('roundToHalf', () => {
  it('rounds to nearest 0.5', () => {
    expect(roundToHalf(1.3)).toBe(1.5);
    expect(roundToHalf(1.7)).toBe(1.5);
    expect(roundToHalf(2.0)).toBe(2.0);
    expect(roundToHalf(0.1)).toBe(0);
  });
});

describe('calcEst', () => {
  it('uses prior when no estHours', () => {
    expect(calcEst('reading', undefined, DEFAULT_MULTIPLIERS)).toBe(1.5);
    expect(calcEst('essay', undefined, DEFAULT_MULTIPLIERS)).toBe(4.0);
    expect(calcEst('exam', undefined, DEFAULT_MULTIPLIERS)).toBe(5.0);
  });

  it('uses estHours directly when provided', () => {
    expect(calcEst('reading', 3, DEFAULT_MULTIPLIERS)).toBe(3.0);
    expect(calcEst('essay', 5.5, DEFAULT_MULTIPLIERS)).toBe(5.5);
  });

  it('applies multiplier', () => {
    const m = { ...DEFAULT_MULTIPLIERS, essay: 1.4 };
    expect(calcEst('essay', undefined, m)).toBe(roundToHalf(4.0 * 1.4));
  });
});

describe('calibrate', () => {
  it('blends actual vs estimated (0.3/0.7)', () => {
    const m = { ...DEFAULT_MULTIPLIERS };
    const updated = calibrate('essay', 4.0, 6.0, m);
    const ratio = 6.0 / 4.0;
    expect(updated.essay).toBeCloseTo(0.3 * ratio + 0.7 * 1.0);
  });

  it('only updates the given type', () => {
    const m = { ...DEFAULT_MULTIPLIERS };
    const updated = calibrate('quiz', 1.5, 2.0, m);
    expect(updated.reading).toBe(1.0);
    expect(updated.homework).toBe(1.0);
  });
});
