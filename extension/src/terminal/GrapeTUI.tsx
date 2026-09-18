import React, { useEffect, useRef, useState } from 'react';
import type { Assignment } from '../engine/types';
import { zone, HORIZON } from '../engine/scheduler';
import { formatClock, formatDuration, normDomain, type Ctx, type AppSnapshot } from './commands';

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const ZONE_TONE: Record<string, string> = { healthy: 'text-green', tight: 'text-warn', overload: 'text-error' };
const REQUIRED = new Set(['instagram.com', 'discord.com', 'youtube.com']);
const VIEWS = ['tasks', 'forecast', 'shop', 'settings', 'rewards'] as const;
type View = typeof VIEWS[number];

function deadlineLoad(assignments: Assignment[]): number[] {
  const load = Array(HORIZON).fill(0) as number[];
  for (const a of assignments) {
    if (a.done) continue;
    const idx = Math.min(Math.max(0, a.dueInDays - 1), HORIZON - 1);
    load[idx] += a.calEst;
  }
  return load;
}

function Panel({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`relative border border-line px-3 pt-3.5 pb-2.5 ${className}`}>
      <span className="absolute -top-2 left-3 bg-void px-1 text-[10px] uppercase tracking-[0.2em] text-grape">{title}</span>
      {children}
    </div>
  );
}

interface InputState { kind: 'addtask' | 'addsite' | 'apikey'; buffer: string }

export default function GrapeTUI({ ctx, surface, onExit }: { ctx: Ctx; surface: 'dashboard' | 'popup'; onExit: () => void }) {
  const isPopup = surface === 'popup';
  const [snap, setSnap] = useState<AppSnapshot>(ctx.snapshot());
  const [view, setView] = useState<View>('tasks');
  const [sel, setSel] = useState(0);
  const [minutes, setMinutes] = useState<Record<string, number>>({});
  const [input, setInput] = useState<InputState | null>(null);
  const [, setTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const reload = () => ctx.refresh().then(setSnap);
  useEffect(() => { reload(); rootRef.current?.focus(); }, []);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t); }, []);

  const activeView: View = isPopup ? 'tasks' : view;
  const active = snap.assignments.filter(a => !a.done);
  const doneTasks = snap.assignments.filter(a => a.done);

  // list length for the current view's selection
  const listLen =
    activeView === 'tasks' ? active.length :
    activeView === 'shop' ? snap.blockedSites.length :
    activeView === 'settings' ? snap.blockedSites.length : 0;
  const clampSel = (n: number) => Math.max(0, Math.min(Math.max(0, listLen - 1), n));

  const switchView = (v: View) => { setView(v); setSel(0); };

  const submitInput = async () => {
    if (!input) return;
    const val = input.buffer.trim();
    if (val) {
      if (input.kind === 'addtask') {
        const task: Assignment = { id: `manual-${Date.now()}`, title: val, type: 'homework', dueInDays: 1, calEst: 0, source: 'mock', done: false };
        await ctx.send({ type: 'UPDATE_ASSIGNMENTS', assignments: [...snap.assignments, task] });
      } else if (input.kind === 'addsite') {
        const d = normDomain(val);
        if (d && !snap.blockedSites.includes(d)) await ctx.send({ type: 'SET_BLOCKED_SITES', blockedSites: [...snap.blockedSites, d] });
      } else if (input.kind === 'apikey') {
        await chrome.storage.local.set({ openAiApiKey: val });
      }
      reload();
    }
    setInput(null);
  };

  const markDone = async () => {
    const t = active[sel];
    if (!t) return;
    const updated = snap.assignments.map(a => (a.id === t.id ? { ...a, done: true, mode: 'early' as const } : a));
    await ctx.send({ type: 'UPDATE_ASSIGNMENTS', assignments: updated });
    if (snap.aiModeEnabled) await ctx.send({ type: 'COMPLETE_TASK_UNLOCK' });
    setSel(s => clampSel(s));
    reload();
  };

  const buyUnlock = async () => {
    const site = snap.blockedSites[sel];
    if (!site) return;
    const min = minutes[site] ?? 5;
    await ctx.send({ type: 'BUY_UNLOCK_TIME', domain: site, minutes: min });
    reload();
  };

  const removeSite = async () => {
    const site = snap.blockedSites[sel];
    if (!site || REQUIRED.has(site)) return;
    await ctx.send({ type: 'SET_BLOCKED_SITES', blockedSites: snap.blockedSites.filter(s => s !== site) });
    setSel(s => clampSel(s - 1));
    reload();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Input capture mode (add task / add site / api key)
    if (input) {
      if (e.key === 'Enter') { e.preventDefault(); submitInput(); }
      else if (e.key === 'Escape') { e.preventDefault(); setInput(null); }
      else if (e.key === 'Backspace') { e.preventDefault(); setInput({ ...input, buffer: input.buffer.slice(0, -1) }); }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setInput({ ...input, buffer: input.buffer + e.key }); }
      return;
    }

    if (e.key === 'q' || e.key === 'Escape') { onExit(); return; }

    // View switching (dashboard only)
    if (!isPopup) {
      if (e.key === 'Tab') { e.preventDefault(); const i = VIEWS.indexOf(view); switchView(VIEWS[(i + (e.shiftKey ? VIEWS.length - 1 : 1)) % VIEWS.length]); return; }
      const num = Number(e.key);
      if (num >= 1 && num <= VIEWS.length) { switchView(VIEWS[num - 1]); return; }
    }

    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setSel(s => clampSel(s + 1)); return; }
    if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setSel(s => clampSel(s - 1)); return; }
    if (e.key === 'r') { reload(); return; }

    if (activeView === 'tasks') {
      if (e.key === 'Enter') { e.preventDefault(); markDone(); }
      else if (e.key === 'a') { e.preventDefault(); setInput({ kind: 'addtask', buffer: '' }); }
    } else if (activeView === 'shop') {
      const site = snap.blockedSites[sel];
      if (e.key === '+' || e.key === 'l') setMinutes(m => ({ ...m, [site]: (m[site] ?? 5) + 1 }));
      else if (e.key === '-' || e.key === 'h') setMinutes(m => ({ ...m, [site]: Math.max(1, (m[site] ?? 5) - 1) }));
      else if (e.key === 'Enter') { e.preventDefault(); buyUnlock(); }
    } else if (activeView === 'settings') {
      if (e.key === 'a') { e.preventDefault(); setInput({ kind: 'addsite', buffer: '' }); }
      else if (e.key === 'd') { e.preventDefault(); removeSite(); }
      else if (e.key === 'm') { ctx.send({ type: 'SET_AI_MODE', enabled: !snap.aiModeEnabled }).then(reload); }
      else if (e.key === 'k') { e.preventDefault(); setInput({ kind: 'apikey', buffer: '' }); }
    }
  };

  const loads = deadlineLoad(snap.assignments);
  const maxLoad = Math.max(1, ...loads);
  const now = Date.now();
  const soonest = Object.values(snap.unblockedSites).filter(x => x > now).sort((a, b) => a - b)[0];

  const HINTS: Record<View, string> = {
    tasks: '[j/k] move  [enter] done  [a] add',
    forecast: 'read-only',
    shop: '[j/k] pick  [-/+] mins  [enter] buy',
    settings: '[j/k] pick  [a] add  [d] remove  [m] mode  [k] api key',
    rewards: '[j/k] scroll',
  };

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`crt bg-void font-mono text-sm text-green outline-none flex flex-col ${isPopup ? 'h-[32rem] w-96 p-3' : 'min-h-screen w-full p-4'}`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
        <span className="text-grape">grape<span className="text-dim">OS</span><span className="text-dim"> · {activeView}</span></span>
        <span className="text-dim">{formatClock(new Date())}</span>
      </div>

      {/* Tabs (dashboard only) */}
      {!isPopup && (
        <div className="mb-3 flex gap-1 text-xs">
          {VIEWS.map((v, i) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              className={`px-2 py-0.5 cursor-pointer ${v === view ? 'bg-grape text-void' : 'text-dim hover:text-green'}`}
            >
              {i + 1}·{v}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-1 pt-2">
        {activeView === 'tasks' && (
          <Panel title="tasks">
            {active.length === 0 && <div className="text-dim">no active tasks — press [a] to add</div>}
            {active.map((t, i) => (
              <div key={t.id} className={`truncate ${i === sel ? 'bg-grape-deep text-void px-1' : 'text-ink px-1'}`}>
                {i === sel ? '▸ ' : '  '}[ ] {t.title}
              </div>
            ))}
            {doneTasks.slice(0, isPopup ? 20 : 6).map(t => (
              <div key={t.id} className="truncate px-1 text-dim">  [x] {t.title}</div>
            ))}
            <div className="mt-2 text-[11px] text-dim">{active.length} active · {doneTasks.length} done</div>
          </Panel>
        )}

        {activeView === 'forecast' && (
          <Panel title="13-day forecast">
            <div className="flex items-end gap-2">
              {loads.map((h, i) => {
                const lvl = h <= 0 ? -1 : Math.min(7, Math.round((h / maxLoad) * 7));
                return (
                  <div key={i} className="flex flex-1 flex-col items-center">
                    <span className={`text-2xl leading-none ${lvl < 0 ? 'text-line' : ZONE_TONE[zone(h)]}`}>{lvl < 0 ? '·' : BLOCKS[lvl]}</span>
                    <span className="mt-1 text-[9px] text-dim">{i === 0 ? 'T0' : `+${i + 1}`}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-4 text-[11px] text-dim">
              <span className="text-green">▇ ≤2.5h</span><span className="text-warn">▇ 2.5–4h</span><span className="text-error">▇ &gt;4h</span>
            </div>
          </Panel>
        )}

        {activeView === 'shop' && (
          <Panel title="shop">
            <div className="mb-2 text-[11px] text-dim"><span className="text-coin">{snap.coinBalance}</span> coins · 10 coins = 1 min</div>
            {snap.blockedSites.map((site, i) => {
              const min = minutes[site] ?? 5;
              return (
                <div key={site} className={`flex justify-between px-1 ${i === sel ? 'bg-grape-deep text-void' : 'text-ink'}`}>
                  <span className="truncate">{i === sel ? '▸ ' : '  '}{site}</span>
                  <span className={i === sel ? 'text-void' : 'text-dim'}>{min}m · {min * 10}c</span>
                </div>
              );
            })}
          </Panel>
        )}

        {activeView === 'settings' && (
          <div className="space-y-4">
            <Panel title="focus gate">
              <div>mode <span className={snap.aiModeEnabled ? 'text-green' : 'text-dim'}>{snap.aiModeEnabled ? 'ON' : 'OFF'}</span> <span className="text-dim">· press [m] to toggle</span></div>
              <div>api key <span className={snap.openAiApiKey ? 'text-green' : 'text-dim'}>{snap.openAiApiKey ? 'set' : 'none'}</span> <span className="text-dim">· press [k] to set</span></div>
            </Panel>
            <Panel title="blocked sites">
              {snap.blockedSites.map((site, i) => (
                <div key={site} className={`flex justify-between px-1 ${i === sel ? 'bg-grape-deep text-void' : 'text-ink'}`}>
                  <span className="truncate">{i === sel ? '▸ ' : '  '}{site}</span>
                  <span className={i === sel ? 'text-void' : 'text-dim'}>{REQUIRED.has(site) ? 'required' : ''}</span>
                </div>
              ))}
              <div className="mt-2 text-[11px] text-dim">[a] add · [d] remove selected</div>
            </Panel>
          </div>
        )}

        {activeView === 'rewards' && (
          <Panel title="reward log">
            {snap.rewardEvents.length === 0 && <div className="text-dim">no events yet.</div>}
            {[...snap.rewardEvents].reverse().map((e, i) => (
              <div key={i} className="flex gap-2">
                <span className={`shrink-0 ${e.delta > 0 ? 'text-green' : 'text-dim'}`}>{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
                <span className="truncate text-ink">{e.label}</span>
              </div>
            ))}
          </Panel>
        )}
      </div>

      {/* Status (dashboard) */}
      {!isPopup && (
        <div className="mt-3 flex gap-5 border-t border-line pt-2 text-[11px]">
          <span><span className="text-dim">coins </span><span className="text-coin">{snap.coinBalance}</span></span>
          <span><span className="text-dim">gate </span><span className={snap.aiModeEnabled ? 'text-green' : 'text-dim'}>{snap.aiModeEnabled ? 'ON' : 'OFF'}</span></span>
          <span><span className="text-dim">today </span><span className={ZONE_TONE[zone(loads[0])]}>{loads[0].toFixed(1)}h</span></span>
          <span><span className="text-dim">apps </span>{soonest ? <span className="text-grape">open {formatDuration((soonest - now) / 1000)}</span> : <span className="text-error">blocked</span>}</span>
        </div>
      )}

      {/* Footer / input line */}
      <div className="mt-2 border-t border-line pt-2 text-[11px] text-dim">
        {input ? (
          <span className="text-green">
            {input.kind === 'addtask' ? 'new task: ' : input.kind === 'addsite' ? 'block domain: ' : 'api key: '}
            {input.kind === 'apikey' ? '•'.repeat(input.buffer.length) : input.buffer}
            <span className="caret" />
            <span className="text-dim">  [enter] ok  [esc] cancel</span>
          </span>
        ) : (
          <span>{HINTS[activeView]}&nbsp;&nbsp;{!isPopup && '[tab] view  '}<span className="text-grape">[q]</span> quit</span>
        )}
      </div>
    </div>
  );
}
