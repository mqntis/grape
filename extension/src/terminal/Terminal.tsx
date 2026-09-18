import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  COMMANDS, parseInput, formatClock, formatDuration,
  line, seg, type Line, type Tone, type Ctx, type AppSnapshot,
} from './commands';
import GrapeTUI from './GrapeTUI';

const DEFAULT_BLOCKED = ['instagram.com', 'discord.com', 'youtube.com'];

const TONE_CLASS: Record<Tone, string> = {
  green: 'text-green',
  grape: 'text-grape',
  dim: 'text-dim',
  warn: 'text-warn',
  error: 'text-error',
  coin: 'text-coin',
  ink: 'text-ink',
};

// Promisified runtime message.
const send = (msg: Record<string, unknown>): Promise<any> =>
  new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));

function normalize(s: any): AppSnapshot {
  return {
    assignments: s?.assignments ?? [],
    coinBalance: Number(s?.coinBalance ?? 0),
    blockedSites: s?.blockedSites ?? DEFAULT_BLOCKED,
    unblockedSites: s?.unblockedSites ?? {},
    aiModeEnabled: s?.aiModeEnabled ?? true,
    rewardEvents: s?.rewardEvents ?? [],
    openAiApiKey: s?.openAiApiKey ?? '',
  };
}

interface ClockState { kind: 'timer' | 'stopwatch'; startedAt: number; durationSec?: number }

// figlet-style wordmark (raw string keeps backslashes/backticks literal)
const ART = String.raw`
  __ _ _ __ __ _ _ __   ___
 / _\` | '__/ _\` | '_ \ / _ \
| (_| | | | (_| | |_) |  __/
 \__, |_|  \__,_| .__/ \___|
 |___/          |_|`;

const BANNER: Line[] = [
  ...ART.split('\n').filter(Boolean).map(l => line(l, 'grape')),
  [seg('grapeOS v1', 'dim')],
  [seg('type ', 'dim'), seg('help', 'grape'), seg(' for commands  ·  ', 'dim'), seg('grape', 'grape'), seg(' to launch the TUI', 'dim')],
  line('', 'dim'),
];

export default function Terminal({ surface = 'dashboard' }: { surface?: 'dashboard' | 'popup' }) {
  const [lines, setLines] = useState<Line[]>(BANNER);
  const [input, setInput] = useState('');
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [showTUI, setShowTUI] = useState(false);

  const snapRef = useRef<AppSnapshot>(normalize(null));
  const historyRef = useRef<string[]>([]);
  const histIdx = useRef<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerFired = useRef(false);

  const print = useCallback((newLines: Line[]) => setLines(prev => [...prev, ...newLines]), []);

  // 1s heartbeat for the clock + live timer/stopwatch line.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Load initial state.
  useEffect(() => { send({ type: 'GET_STATE' }).then(s => { snapRef.current = normalize(s); }); }, []);

  // Timer completion.
  useEffect(() => {
    if (clock?.kind === 'timer' && clock.durationSec != null) {
      const remaining = clock.durationSec - (Date.now() - clock.startedAt) / 1000;
      if (remaining <= 0 && !timerFired.current) {
        timerFired.current = true;
        print([line("time's up.", 'warn')]);
        setClock(null);
      }
    }
  }, [tick, clock, print]);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [lines, clock, tick]);

  const ctx: Ctx = {
    snapshot: () => snapRef.current,
    refresh: async () => { const s = normalize(await send({ type: 'GET_STATE' })); snapRef.current = s; return s; },
    send,
    clearScreen: () => setLines([]),
    launchTUI: () => setShowTUI(true),
    startTimer: (seconds) => { timerFired.current = false; setClock({ kind: 'timer', startedAt: Date.now(), durationSec: seconds }); },
    startStopwatch: () => setClock({ kind: 'stopwatch', startedAt: Date.now() }),
    stopClock: () => { const was = clock !== null; setClock(null); return was; },
  };

  const runLine = async (raw: string) => {
    print([[seg('> ', 'grape'), seg(raw, 'green')]]);
    const { name, args } = parseInput(raw);
    if (!name) return;
    historyRef.current = [...historyRef.current, raw];
    histIdx.current = historyRef.current.length;
    const cmd = COMMANDS[name];
    if (!cmd) { print([line(`grape: command not found: ${name}  ·  try 'help'`, 'error')]); return; }
    const out = await cmd.run(args, ctx);
    if (out.length) print(out);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const raw = input;
      setInput('');
      runLine(raw);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = historyRef.current;
      if (h.length === 0) return;
      histIdx.current = Math.max(0, histIdx.current - 1);
      setInput(h[histIdx.current] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const h = historyRef.current;
      histIdx.current = Math.min(h.length, histIdx.current + 1);
      setInput(h[histIdx.current] ?? '');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  // Live timer/stopwatch readout.
  let liveLine: Line | null = null;
  if (clock) {
    const elapsed = (Date.now() - clock.startedAt) / 1000;
    if (clock.kind === 'timer' && clock.durationSec != null) {
      liveLine = [seg('⏳ ', 'grape'), seg(formatDuration(Math.max(0, clock.durationSec - elapsed)), 'green'), seg('  remaining', 'dim')];
    } else {
      liveLine = [seg('⏱ ', 'grape'), seg(formatDuration(elapsed), 'green'), seg('  elapsed', 'dim')];
    }
  }

  const height = surface === 'popup' ? 'h-[32rem] w-96' : 'min-h-screen';

  if (showTUI) {
    return <GrapeTUI ctx={ctx} surface={surface} onExit={() => { setShowTUI(false); print([line('exited grape.', 'dim')]); }} />;
  }

  return (
    <div
      className={`crt ${height} bg-void p-3 font-mono text-sm cursor-text`}
      onClick={() => inputRef.current?.focus()}
    >
      <div ref={scrollRef} className="h-full overflow-y-auto">
        {lines.map((ln, i) => (
          <div key={i} className="line-in whitespace-pre-wrap break-words leading-snug">
            {ln.length === 0 ? ' ' : ln.map((s, j) => <span key={j} className={s.c ? TONE_CLASS[s.c] : 'text-green'}>{s.t}</span>)}
          </div>
        ))}

        {liveLine && (
          <div className="leading-snug">
            {liveLine.map((s, j) => <span key={j} className={s.c ? TONE_CLASS[s.c] : 'text-green'}>{s.t}</span>)}
          </div>
        )}

        <div className="flex items-center gap-2 leading-snug">
          <span className="text-grape">&gt;</span>
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            aria-label="terminal input"
            className="flex-1 bg-transparent text-green outline-none caret-grape"
            style={{ caretColor: 'var(--color-grape)' }}
          />
          <span className="text-dim shrink-0">{formatClock(new Date())}</span>
        </div>
      </div>
    </div>
  );
}
