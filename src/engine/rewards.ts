import type { RewardEvent } from './types.js';
import { MAX } from './scheduler.js';

const LATE_NIGHT_HOUR = 22;

export interface RewardResult {
  delta: number;
  label: string;
  reason: string;
}

export function earlyBird(daysEarly: number): RewardResult {
  const delta = Math.min(daysEarly, 4) * 8;
  return {
    delta,
    label: 'Early Bird',
    reason: `Finished ${daysEarly} day${daysEarly !== 1 ? 's' : ''} early — earned ${delta} coins`,
  };
}

export function pacedDay(): RewardResult {
  return { delta: 6, label: 'Paced Day', reason: 'Stayed within your paced daily load' };
}

export function restProtected(): RewardResult {
  return { delta: 15, label: 'Rest Protected', reason: 'Protected your rest time today' };
}

export function smoothWeek(): RewardResult {
  return { delta: 25, label: 'Smooth Week', reason: 'Maintained a balanced workload all week' };
}

export function honestLog(): RewardResult {
  return { delta: 4, label: 'Honest Log', reason: 'Logged your actual effort honestly' };
}

export function cram(): RewardResult {
  return {
    delta: 0,
    label: 'Cram (no coins)',
    reason: 'Cramming earns zero coins by design — sustainable pacing is the goal',
  };
}

export function overCap(hoursToday: number): RewardResult {
  return {
    delta: 0,
    label: 'Over Cap (no coins)',
    reason: `Today's load (${hoursToday}h) exceeded the ${MAX}h daily cap — grinding earns zero coins`,
  };
}

export function lateNight(): RewardResult {
  return {
    delta: 0,
    label: 'Late Night (no coins)',
    reason: `Work logged after ${LATE_NIGHT_HOUR}:00 earns zero coins — protect your rest`,
  };
}

export function rechargeSpend(balance: number): { ok: boolean; newBalance: number; message: string } {
  const COST = 40;
  if (balance < COST) {
    return { ok: false, newBalance: balance, message: `Need ${COST} coins for a Recharge day (you have ${balance})` };
  }
  return { ok: true, newBalance: balance - COST, message: 'Recharge day unlocked — rest guilt-free' };
}

export function checkCram(hoursUntilDue: number): boolean {
  return hoursUntilDue < 12;
}

export function checkOverCap(hoursToday: number): boolean {
  return hoursToday > MAX;
}

export function checkLateNight(submittedAt: Date): boolean {
  return submittedAt.getHours() >= LATE_NIGHT_HOUR;
}

export function makeRewardEvent(result: RewardResult, type: string): RewardEvent {
  return { type, delta: result.delta, label: result.label, reason: result.reason, timestamp: Date.now() };
}
