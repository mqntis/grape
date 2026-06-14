import type { Assignment, CrunchInfo, Zone } from './types.js';

function roundToFiveMinutes(hours: number): number {
  return Math.round(hours * 12) / 12;
}

export const COMFORT = 2.5;
export const MAX = 4.0;
export const HORIZON = 13;

export function zone(hours: number): Zone {
  if (hours > MAX) return 'overload';
  if (hours > COMFORT) return 'tight';
  return 'healthy';
}

export function paced(items: Assignment[], horizon: number = HORIZON): number[] {
  const load = Array(horizon).fill(0) as number[];
  const sorted = [...items].sort((x, y) => x.dueInDays - y.dueInDays);
  for (const a of sorted) {
    const dueIdx = Math.min(a.dueInDays - 1, horizon - 1);
    let rem = a.calEst;
    while (rem > 0.001) {
      let best = -1;
      for (let d = 0; d <= dueIdx; d++) {
        if (best < 0 || load[d] < load[best]) best = d;
      }
      if (best < 0) break;
      const add = Math.min(0.5, rem);
      load[best] += add;
      rem -= add;
    }
  }
  return load.map(roundToFiveMinutes);
}

export function natural(items: Assignment[], horizon: number = HORIZON): number[] {
  const load = Array(horizon).fill(0) as number[];
  const sorted = [...items].sort((x, y) => y.dueInDays - x.dueInDays);
  const CRAM = 6;
  for (const a of sorted) {
    let rem = a.calEst;
    let d = Math.min(a.dueInDays - 1, horizon - 1);
    while (rem > 0.001 && d >= 0) {
      const add = Math.min(Math.max(CRAM - load[d], 0), rem);
      if (add > 0) {
        load[d] += add;
        rem -= add;
      }
      d--;
    }
  }
  return load.map(roundToFiveMinutes);
}

export function crunch(naturalLoad: number[]): CrunchInfo {
  let longestRun = 0;
  let longestStart = -1;
  let peakInRun = 0;
  let currentRun = 0;
  let currentStart = -1;
  let currentPeak = 0;

  for (let i = 0; i < naturalLoad.length; i++) {
    if (naturalLoad[i] > MAX) {
      if (currentRun === 0) {
        currentStart = i;
        currentPeak = 0;
      }
      currentRun++;
      currentPeak = Math.max(currentPeak, naturalLoad[i]);
      if (currentRun > longestRun) {
        longestRun = currentRun;
        longestStart = currentStart;
        peakInRun = currentPeak;
      }
    } else {
      currentRun = 0;
      currentPeak = 0;
    }
  }

  return {
    runLength: longestRun,
    peakHours: longestRun > 0 ? peakInRun : 0,
    startsInDays: longestRun > 0 ? longestStart + 1 : -1,
  };
}
