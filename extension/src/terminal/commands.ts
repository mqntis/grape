import type { Assignment, RewardEvent } from '../engine/types';

// ── Output model ──────────────────────────────────────────────────────────
// A line is a list of colored segments. `tone` maps to a phosphor color class.
export type Tone = 'green' | 'grape' | 'dim' | 'warn' | 'error' | 'coin' | 'ink';
export interface Seg { t: string; c?: Tone }
export type Line = Seg[];

export const line = (t: string, c?: Tone): Line => [{ t, c }];
export const seg = (t: string, c?: Tone): Seg => ({ t, c });

// Context handed to every command — state access, output, and control actions.
export interface AppSnapshot {
  assignments: Assignment[];
  coinBalance: number;
  blockedSites: string[];
  unblockedSites: Record<string, number>;
  aiModeEnabled: boolean;
  rewardEvents: RewardEvent[];
  openAiApiKey: string;
}

// Normalizes a user-typed domain (exported for the TUI's settings view).
export const normDomain = (s: string) =>
  s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
export interface Ctx {
  snapshot: () => AppSnapshot;
  refresh: () => Promise<AppSnapshot>;
  send: (msg: Record<string, unknown>) => Promise<any>;
  clearScreen: () => void;
  launchTUI: () => void;
  startTimer: (seconds: number) => void;
  startStopwatch: () => void;
  stopClock: () => boolean;
}

export interface Command {
  name: string;
  help: string;
  usage?: string;
  run: (args: string[], ctx: Ctx) => Promise<Line[]> | Line[];
}

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

// Splits a raw input line into a command name + args.
export function parseInput(raw: string): { name: string; args: string[] } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  return { name: (parts[0] ?? '').toLowerCase(), args: parts.slice(1) };
}

// Parses a duration into seconds: "90s", "25m", "1h", "25:00", "1:30:00", or a bare number (seconds).
export function parseDuration(input: string): number | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();

  if (s.includes(':')) {
    const parts = s.split(':').map(Number);
    if (parts.some(n => Number.isNaN(n))) return null;
    const secs = parts.reduce((acc, n) => acc * 60 + n, 0);
    return secs > 0 ? secs : null;
  }
  const m = s.match(/^(\d+)(h|m|s)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? 's';
  const mult = unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
  const secs = n * mult;
  return secs > 0 ? secs : null;
}

// Formats seconds as M:SS or H:MM:SS.
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// 12-hour wall clock like "7:18 PM".
export function formatClock(date: Date): string {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// ── Command registry ───────────────────────────────────────────────────────

export const COMMANDS: Record<string, Command> = {
  help: {
    name: 'help',
    help: 'list every command',
    run: () => helpLines(),
  },

  grape: {
    name: 'grape',
    help: 'launch the full grape TUI',
    run: (_a, ctx) => { ctx.launchTUI(); return []; },
  },

  clear: {
    name: 'clear',
    help: 'clear the screen',
    run: (_a, ctx) => { ctx.clearScreen(); return []; },
  },

  time: {
    name: 'time',
    help: 'show the current time',
    run: () => {
      const d = new Date();
      return [[seg('> ', 'grape'), seg(formatClock(d), 'green')]];
    },
  },

  date: {
    name: 'date',
    help: "show today's date",
    run: () => [line(new Date().toDateString(), 'green')],
  },

  timer: {
    name: 'timer',
    help: 'countdown timer',
    usage: 'timer <25m | 25:00 | 90s>',
    run: (args, ctx) => {
      const secs = parseDuration(args[0] ?? '');
      if (!secs) return [line('timer: bad duration — try  timer 25m', 'error')];
      ctx.startTimer(secs);
      return [line(`timer set for ${formatDuration(secs)}  ·  type 'stop' to cancel`, 'dim')];
    },
  },

  stopwatch: {
    name: 'stopwatch',
    help: 'count up until stopped',
    run: (_a, ctx) => {
      ctx.startStopwatch();
      return [line("stopwatch running  ·  type 'stop' to halt", 'dim')];
    },
  },

  stop: {
    name: 'stop',
    help: 'stop the timer / stopwatch',
    run: (_a, ctx) => {
      const stopped = ctx.stopClock();
      return [line(stopped ? 'stopped.' : 'nothing running.', 'dim')];
    },
  },

  coins: {
    name: 'coins',
    help: 'show coin balance',
    run: async (_a, ctx) => {
      const s = await ctx.refresh();
      return [[seg(`${s.coinBalance}`, 'coin'), seg(' coins', 'dim')]];
    },
  },

  tasks: {
    name: 'tasks',
    help: 'list your tasks',
    run: async (_a, ctx) => {
      const s = await ctx.refresh();
      return taskLines(s.assignments);
    },
  },

  done: {
    name: 'done',
    help: 'mark task N complete',
    usage: 'done <n>',
    run: async (args, ctx) => {
      const s = await ctx.refresh();
      const active = s.assignments.filter(a => !a.done);
      const n = Number(args[0]);
      if (!n || n < 1 || n > active.length) return [line(`done: no active task #${args[0] ?? ''}`, 'error')];
      const target = active[n - 1];
      const updated = s.assignments.map(a => (a.id === target.id ? { ...a, done: true, mode: 'early' as const } : a));
      await ctx.send({ type: 'UPDATE_ASSIGNMENTS', assignments: updated });
      const out: Line[] = [line(`done: ${target.title}`, 'green')];
      if (s.aiModeEnabled) {
        const res = await ctx.send({ type: 'COMPLETE_TASK_UNLOCK' });
        if (res?.ok && !res.alreadyActive) out.push(line('apps unlocked for 10:00', 'grape'));
      }
      return out;
    },
  },

  add: {
    name: 'add',
    help: 'add a task',
    usage: 'add <title>',
    run: async (args, ctx) => {
      const title = args.join(' ').trim();
      if (!title) return [line('add: needs a title', 'error')];
      const s = await ctx.refresh();
      const task: Assignment = {
        id: `manual-${Date.now()}`, title, type: 'homework', dueInDays: 1, calEst: 0, source: 'mock', done: false,
      };
      await ctx.send({ type: 'UPDATE_ASSIGNMENTS', assignments: [...s.assignments, task] });
      return [line(`added: ${title}`, 'green')];
    },
  },

  sites: {
    name: 'sites',
    help: 'list blocked sites',
    run: async (_a, ctx) => {
      const s = await ctx.refresh();
      if (s.blockedSites.length === 0) return [line('no sites blocked.', 'dim')];
      const now = Date.now();
      return s.blockedSites.map(site => {
        const exp = s.unblockedSites[site];
        const open = typeof exp === 'number' && exp > now;
        return [seg(open ? '○ ' : '● ', open ? 'green' : 'error'), seg(site, 'ink'),
          seg(open ? `  open ${formatDuration((exp - now) / 1000)}` : '  blocked', 'dim')];
      });
    },
  },

  block: {
    name: 'block',
    help: 'add a site to the block list',
    usage: 'block <domain>',
    run: async (args, ctx) => {
      const d = normDomain(args[0] ?? '');
      if (!d) return [line('block: needs a domain', 'error')];
      const s = await ctx.refresh();
      if (s.blockedSites.includes(d)) return [line(`${d} already blocked`, 'dim')];
      await ctx.send({ type: 'SET_BLOCKED_SITES', blockedSites: [...s.blockedSites, d] });
      return [line(`blocking ${d}`, 'green')];
    },
  },

  allow: {
    name: 'allow',
    help: 'remove a site from the block list',
    usage: 'allow <domain>',
    run: async (args, ctx) => {
      const d = normDomain(args[0] ?? '');
      const s = await ctx.refresh();
      if (!s.blockedSites.includes(d)) return [line(`${d} is not on the list`, 'dim')];
      await ctx.send({ type: 'SET_BLOCKED_SITES', blockedSites: s.blockedSites.filter(x => x !== d) });
      return [line(`allowed ${d}`, 'green')];
    },
  },

  unlock: {
    name: 'unlock',
    help: 'buy temporary access (10 coins/min)',
    usage: 'unlock <domain> <min>',
    run: async (args, ctx) => {
      const d = normDomain(args[0] ?? '');
      const min = Number(args[1]);
      if (!d || !min || min < 1) return [line('unlock: usage — unlock <domain> <min>', 'error')];
      const res = await ctx.send({ type: 'BUY_UNLOCK_TIME', domain: d, minutes: min });
      if (!res?.ok) return [line(`unlock: ${res?.error ?? 'failed'}`, 'error')];
      return [line(`unlocked ${d} for ${min}m  ·  ${min * 10} coins spent`, 'green')];
    },
  },

  shop: {
    name: 'shop',
    help: 'unlock prices (10 coins/min)',
    run: async (_a, ctx) => {
      const s = await ctx.refresh();
      const out: Line[] = [[seg(`${s.coinBalance}`, 'coin'), seg(' coins  ·  10 coins = 1 min', 'dim')]];
      s.blockedSites.forEach(site => out.push([seg('  ', 'dim'), seg(site, 'ink'), seg('   unlock ' + site + ' <min>', 'dim')]));
      return out;
    },
  },

  mode: {
    name: 'mode',
    help: 'AI focus-gate on/off',
    usage: 'mode [on|off]',
    run: async (args, ctx) => {
      const s = await ctx.refresh();
      const arg = (args[0] ?? '').toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        return [line(`focus gate: ${s.aiModeEnabled ? 'ON' : 'OFF'}  ·  toggle with  mode on|off`, 'dim')];
      }
      await ctx.send({ type: 'SET_AI_MODE', enabled: arg === 'on' });
      return [line(`focus gate: ${arg.toUpperCase()}`, 'grape')];
    },
  },

  apikey: {
    name: 'apikey',
    help: 'set the OpenAI API key',
    usage: 'apikey <sk-...>',
    run: async (args) => {
      const k = (args[0] ?? '').trim();
      if (!k) return [line('apikey: needs a key', 'error')];
      await chrome.storage.local.set({ openAiApiKey: k });
      return [line('api key saved.', 'green')];
    },
  },
};

// Aliases
COMMANDS['tui'] = COMMANDS['grape'];
COMMANDS['cls'] = COMMANDS['clear'];
COMMANDS['ls'] = COMMANDS['tasks'];

// ── Formatters ─────────────────────────────────────────────────────────────

export function helpLines(): Line[] {
  const seen = new Set<string>();
  const rows: Line[] = [line('commands:', 'dim')];
  for (const key of Object.keys(COMMANDS)) {
    const cmd = COMMANDS[key];
    if (seen.has(cmd.name)) continue;   // skip aliases
    seen.add(cmd.name);
    const label = (cmd.usage ?? cmd.name).padEnd(22, ' ');
    rows.push([seg('  ', 'dim'), seg(label, 'grape'), seg(cmd.help, 'dim')]);
  }
  return rows;
}

export function taskLines(assignments: Assignment[]): Line[] {
  const active = assignments.filter(a => !a.done);
  const done = assignments.filter(a => a.done);
  if (assignments.length === 0) return [line("no tasks. add one with  add <title>", 'dim')];
  const rows: Line[] = [];
  active.forEach((t, i) => rows.push([seg(`  ${i + 1}. `, 'dim'), seg('[ ] ', 'grape'), seg(t.title, 'ink')]));
  done.forEach(t => rows.push([seg('     ', 'dim'), seg('[x] ', 'green'), seg(t.title, 'dim')]));
  rows.push(line(`${active.length} active · ${done.length} done`, 'dim'));
  return rows;
}
