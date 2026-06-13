import type { Assignment, AssignmentType, Multipliers } from './types.js';

export const PRIORS: Record<AssignmentType, number> = {
  reading: 1.5,
  homework: 2.0,
  quiz: 1.5,
  essay: 4.0,
  project: 6.0,
  exam: 5.0,
};

export const DEFAULT_MULTIPLIERS: Multipliers = {
  reading: 1.0,
  homework: 1.0,
  quiz: 1.0,
  essay: 1.0,
  project: 1.0,
  exam: 1.0,
};

export function roundToHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

export function calcEst(
  type: AssignmentType,
  estHours: number | undefined,
  multipliers: Multipliers
): number {
  const base = estHours ?? PRIORS[type] * multipliers[type];
  return roundToHalf(base);
}

export function calibrate(
  type: AssignmentType,
  estimated: number,
  actualHours: number,
  multipliers: Multipliers
): Multipliers {
  const ratio = actualHours / estimated;
  const updated = 0.3 * ratio + 0.7 * multipliers[type];
  return { ...multipliers, [type]: updated };
}

export function buildAssignment(
  partial: Omit<Assignment, 'calEst'> & { calEst?: number },
  multipliers: Multipliers
): Assignment {
  return {
    ...partial,
    calEst: partial.calEst ?? calcEst(partial.type, partial.estHours, multipliers),
  };
}
