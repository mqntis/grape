import { describe, it, expect } from 'vitest';
import { parseInput, parseDuration, formatDuration, formatClock, helpLines, COMMANDS } from '../src/terminal/commands';

describe('parseInput', () => {
  it('splits name and args, lowercases the command', () => {
    expect(parseInput('  DONE 2 ')).toEqual({ name: 'done', args: ['2'] });
  });
  it('handles bare command', () => {
    expect(parseInput('help')).toEqual({ name: 'help', args: [] });
  });
  it('handles empty input', () => {
    expect(parseInput('   ')).toEqual({ name: '', args: [] });
  });
  it('keeps multi-word args', () => {
    expect(parseInput('add read chapter 3')).toEqual({ name: 'add', args: ['read', 'chapter', '3'] });
  });
});

describe('parseDuration', () => {
  it('unit suffixes', () => {
    expect(parseDuration('90s')).toBe(90);
    expect(parseDuration('25m')).toBe(1500);
    expect(parseDuration('1h')).toBe(3600);
  });
  it('bare number is seconds', () => {
    expect(parseDuration('25')).toBe(25);
  });
  it('colon forms', () => {
    expect(parseDuration('25:00')).toBe(1500);
    expect(parseDuration('1:30:00')).toBe(5400);
  });
  it('rejects junk and zero', () => {
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('0')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('M:SS under an hour', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(0)).toBe('0:00');
  });
  it('H:MM:SS over an hour', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('formatClock', () => {
  it('12-hour with AM/PM', () => {
    expect(formatClock(new Date(2026, 0, 1, 19, 18))).toBe('7:18 PM');
    expect(formatClock(new Date(2026, 0, 1, 0, 5))).toBe('12:05 AM');
    expect(formatClock(new Date(2026, 0, 1, 12, 0))).toBe('12:00 PM');
  });
});

describe('helpLines', () => {
  it('lists every unique command name', () => {
    const text = helpLines().map(l => l.map(s => s.t).join('')).join('\n');
    for (const name of ['help', 'grape', 'time', 'timer', 'stopwatch', 'tasks', 'done', 'mode', 'unlock']) {
      expect(text).toContain(name);
    }
  });
  it('does not duplicate aliased commands', () => {
    // `tui` aliases `grape`; the help list should show grape once, not tui.
    const names = helpLines().slice(1).map(l => l[1]?.t.trim().split(' ')[0]);
    expect(names.filter(n => n === 'grape').length).toBe(1);
    expect(names).not.toContain('tui');
  });
});

describe('COMMANDS registry', () => {
  it('aliases resolve to their base command', () => {
    expect(COMMANDS['tui']).toBe(COMMANDS['grape']);
    expect(COMMANDS['cls']).toBe(COMMANDS['clear']);
    expect(COMMANDS['ls']).toBe(COMMANDS['tasks']);
  });
});
