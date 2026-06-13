import { describe, it, expect } from 'vitest';
import {
  earlyBird, pacedDay, restProtected, smoothWeek, honestLog,
  cram, overCap, lateNight, rechargeSpend, checkCram, checkOverCap, checkLateNight
} from '../src/engine/rewards';

describe('earlyBird', () => {
  it('caps at 4 days * 8 = 32', () => {
    expect(earlyBird(4).delta).toBe(32);
    expect(earlyBird(10).delta).toBe(32);
  });
  it('scales linearly below cap', () => {
    expect(earlyBird(1).delta).toBe(8);
    expect(earlyBird(3).delta).toBe(24);
  });
});

describe('positive rewards', () => {
  it('pacedDay returns 6', () => expect(pacedDay().delta).toBe(6));
  it('restProtected returns 15', () => expect(restProtected().delta).toBe(15));
  it('smoothWeek returns 25', () => expect(smoothWeek().delta).toBe(25));
  it('honestLog returns 4', () => expect(honestLog().delta).toBe(4));
});

describe('anti-patterns return 0', () => {
  it('cram earns 0', () => expect(cram().delta).toBe(0));
  it('overCap earns 0', () => expect(overCap(5).delta).toBe(0));
  it('lateNight earns 0', () => expect(lateNight().delta).toBe(0));
});

describe('rechargeSpend', () => {
  it('deducts 40 coins', () => {
    const result = rechargeSpend(100);
    expect(result.ok).toBe(true);
    expect(result.newBalance).toBe(60);
  });
  it('fails when insufficient', () => {
    const result = rechargeSpend(30);
    expect(result.ok).toBe(false);
    expect(result.newBalance).toBe(30);
  });
});

describe('checks', () => {
  it('cram check triggers <12h before due', () => {
    expect(checkCram(10)).toBe(true);
    expect(checkCram(12)).toBe(false);
    expect(checkCram(24)).toBe(false);
  });
  it('overCap check > 4h', () => {
    expect(checkOverCap(4.5)).toBe(true);
    expect(checkOverCap(4)).toBe(false);
  });
  it('lateNight check >= 22:00', () => {
    expect(checkLateNight(new Date('2024-01-01T22:00:00'))).toBe(true);
    expect(checkLateNight(new Date('2024-01-01T21:59:00'))).toBe(false);
    expect(checkLateNight(new Date('2024-01-01T23:00:00'))).toBe(true);
  });
});
