import { describe, it, expect } from 'vitest';
import { paced, natural, crunch, zone, COMFORT, MAX, HORIZON } from '../src/engine/scheduler';
import type { Assignment } from '../src/engine/types';

const makeA = (id: string, dueInDays: number, calEst: number): Assignment => ({
  id, title: id, type: 'homework', dueInDays, calEst, done: false,
});

describe('zone', () => {
  it('returns correct zone', () => {
    expect(zone(1)).toBe('healthy');
    expect(zone(COMFORT)).toBe('healthy');
    expect(zone(3)).toBe('tight');
    expect(zone(MAX)).toBe('tight');
    expect(zone(5)).toBe('overload');
  });
});

describe('paced', () => {
  it('distributes load evenly', () => {
    const items = [makeA('a', 4, 4)];
    const result = paced(items, 13);
    const total = result.reduce((s, h) => s + h, 0);
    expect(total).toBeCloseTo(4, 0);
  });

  it('returns array of length HORIZON', () => {
    expect(paced([], HORIZON)).toHaveLength(HORIZON);
  });

  it('never schedules past due date', () => {
    const items = [makeA('a', 2, 2)];
    const result = paced(items, 13);
    for (let i = 2; i < 13; i++) expect(result[i]).toBe(0);
  });
});

describe('natural', () => {
  it('back-loads near due date', () => {
    const items = [makeA('a', 5, 3)];
    const result = natural(items, 13);
    // Day 4 (index 4, i.e. dueInDays-1=4) should have the most load
    const beforeDue = result.slice(0, 5);
    const afterDue = result.slice(5);
    expect(afterDue.every(h => h === 0)).toBe(true);
    expect(beforeDue[4]).toBeGreaterThan(0);
  });
});

describe('crunch', () => {
  it('detects no crunch when all healthy', () => {
    const load = Array(HORIZON).fill(2);
    const result = crunch(load);
    expect(result.startsInDays).toBe(-1);
    expect(result.runLength).toBe(0);
  });

  it('finds the longest overload run', () => {
    const load = Array(HORIZON).fill(2) as number[];
    load[5] = 5; load[6] = 6; load[7] = 5.5;
    const result = crunch(load);
    expect(result.runLength).toBe(3);
    expect(result.startsInDays).toBe(6);
    expect(result.peakHours).toBe(6);
  });

  it('works with seed mock data cluster', () => {
    // essay+project+exam at days 10-11 should create a crunch
    const seedItems: Assignment[] = [
      { id: '1', title: 'r', type: 'reading', dueInDays: 2, calEst: 1.5, done: false },
      { id: '2', title: 'h', type: 'homework', dueInDays: 3, calEst: 2, done: false },
      { id: '3', title: 'q', type: 'quiz', dueInDays: 4, calEst: 1.5, done: false },
      { id: '4', title: 'h2', type: 'homework', dueInDays: 7, calEst: 2, done: false },
      { id: '5', title: 'r2', type: 'reading', dueInDays: 9, calEst: 1.5, done: false },
      { id: '6', title: 'e', type: 'essay', dueInDays: 10, calEst: 4, done: false },
      { id: '7', title: 'p', type: 'project', dueInDays: 11, calEst: 6, done: false },
      { id: '8', title: 'x', type: 'exam', dueInDays: 11, calEst: 5, done: false },
    ];
    const nl = natural(seedItems);
    const cr = crunch(nl);
    expect(cr.runLength).toBeGreaterThan(0);
  });
});
