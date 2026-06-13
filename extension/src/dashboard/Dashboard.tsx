import React, { useEffect, useState, useCallback } from 'react';
import type { Assignment, RewardEvent, Multipliers } from '../engine/types';
import { paced, natural, crunch, zone, HORIZON } from '../engine/scheduler';
import { computeDrift, driftMessage, SUPPORT_LINK } from '../engine/drift';
import { rechargeSpend, makeRewardEvent, earlyBird } from '../engine/rewards';

interface AppState {
  assignments: Assignment[];
  coinBalance: number;
  rewardEvents: RewardEvent[];
  multipliers: Multipliers;
}

const DAYS = Array.from({ length: HORIZON }, (_, i) => i);
const DAY_LABELS = DAYS.map(i => {
  if (i === 0) return 'Today';
  if (i === 1) return 'Tmrw';
  return `+${i + 1}`;
});

const ZONE_COLORS: Record<string, string> = {
  healthy: '#6aa37f',
  tight: '#d9a441',
  overload: '#c9706a',
};

export default function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);

  const loadState = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res: AppState) => setState(res));
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  if (!state) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-ink/50 font-mono">Loading Grape...</div>
      </div>
    );
  }

  const active = state.assignments.filter(a => !a.done);
  const pacedLoad = paced(active, HORIZON);
  const naturalLoad = natural(active, HORIZON);
  const crunchInfo = crunch(naturalLoad);
  const drift = computeDrift(state.rewardEvents.slice(-20));
  const driftMsg = driftMessage(drift.state);

  const handleRecharge = () => {
    const result = rechargeSpend(state.coinBalance);
    if (!result.ok) { alert(result.message); return; }
    const event = makeRewardEvent({ delta: -40, label: 'Recharge', reason: result.message }, 'recharge');
    chrome.runtime.sendMessage({ type: 'ADD_REWARD', event }, () => loadState());
  };

  const handleMarkDone = (id: string, daysEarly: number) => {
    const updated = state.assignments.map(a =>
      a.id === id ? { ...a, done: true, mode: (daysEarly > 0 ? 'early' : 'cram') as Assignment['mode'] } : a
    );
    chrome.runtime.sendMessage({ type: 'UPDATE_ASSIGNMENTS', assignments: updated }, () => {
      const rewardResult = daysEarly > 0
        ? earlyBird(daysEarly)
        : { delta: 0, label: 'On Time', reason: 'Submitted on time — no early bonus' };
      const event = makeRewardEvent(rewardResult, daysEarly > 0 ? 'earlyBird' : 'onTime');
      chrome.runtime.sendMessage({ type: 'ADD_REWARD', event }, () => loadState());
    });
  };

  const chartMax = Math.max(8, ...naturalLoad, ...pacedLoad);

  return (
    <div className="min-h-screen bg-surface text-ink font-sans p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent tracking-tight">Cadence</h1>
          <p className="text-sm text-ink/50">Workload pacing · not just deadline tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-ink/50">Coin Balance</div>
            <div className="text-xl font-mono font-bold text-gold">{state.coinBalance}</div>
          </div>
          <button
            onClick={handleRecharge}
            className="bg-accent text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors"
          >
            🌱 Recharge (40)
          </button>
        </div>
      </div>

      {/* Drift banner */}
      {driftMsg && (
        <div className={`mb-4 rounded-xl p-4 border ${drift.state === 'strained' ? 'bg-overload/10 border-overload/30' : 'bg-tight/10 border-tight/30'}`}>
          <div className="font-semibold text-sm mb-1">{drift.state === 'strained' ? 'Heads up' : 'Watch your pace'}</div>
          <div className="text-sm text-ink/70">{driftMsg}</div>
          {drift.state === 'strained' && (
            <a href={SUPPORT_LINK} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline mt-1 inline-block">
              Find support →
            </a>
          )}
        </div>
      )}

      {/* Crunch callout */}
      {crunchInfo.startsInDays > 0 && (
        <div className="mb-4 bg-overload/10 border border-overload/30 rounded-xl p-4">
          <div className="font-semibold text-overload text-sm">Crunch Forecast</div>
          <div className="text-sm text-ink/70 mt-1">
            Your natural cram pattern creates <strong>{crunchInfo.runLength} consecutive overload day{crunchInfo.runLength !== 1 ? 's' : ''}</strong> starting in{' '}
            <strong>{crunchInfo.startsInDays} day{crunchInfo.startsInDays !== 1 ? 's' : ''}</strong> (peak: <span className="font-mono">{crunchInfo.peakHours}h</span>).
            The paced plan below smooths this out.
          </div>
        </div>
      )}

      {/* Forecast Chart */}
      <div className="bg-card rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">13-Day Workload Forecast</h2>
          <div className="flex gap-4 text-xs text-ink/60">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-accent rounded-sm"></span>Paced plan</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 border border-dashed border-ink/40 rounded-sm"></span>Natural cram</span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-48">
          {DAYS.map(i => {
            const ph = pacedLoad[i];
            const nh = naturalLoad[i];
            const pz = zone(ph);
            const pHeight = `${(ph / chartMax) * 100}%`;
            const nHeight = `${(nh / chartMax) * 100}%`;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={{ minWidth: 0 }}>
                <div className="relative w-full flex items-end gap-0.5 h-40">
                  {/* Natural cram bar (ghost) */}
                  <div
                    className="flex-1 border border-dashed border-ink/30 rounded-t-sm"
                    style={{ height: nHeight, minHeight: nh > 0 ? '2px' : '0' }}
                  />
                  {/* Paced bar (solid) */}
                  <div
                    className="flex-1 rounded-t-sm"
                    style={{ height: pHeight, backgroundColor: ZONE_COLORS[pz], minHeight: ph > 0 ? '2px' : '0' }}
                  />
                </div>
                <div className="text-[9px] text-ink/40 font-mono truncate w-full text-center">{DAY_LABELS[i]}</div>
                {ph > 0 && <div className="text-[8px] font-mono text-ink/60">{ph}h</div>}
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-ink/50">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-healthy inline-block"></span>≤2.5h healthy</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-tight inline-block"></span>2.5–4h tight</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-overload inline-block"></span>&gt;4h overload</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assignment List */}
        <div className="bg-card rounded-2xl shadow-sm p-5">
          <h2 className="font-semibold mb-3">Assignments</h2>
          {active.length === 0 && <p className="text-sm text-ink/40">No active assignments</p>}
          <div className="space-y-2">
            {[...active].sort((a, b) => a.dueInDays - b.dueInDays).map(a => {
              const z = zone(a.calEst);
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    <div className="text-xs text-ink/50 font-mono">
                      {a.type} · due +{a.dueInDays}d · <span style={{ color: ZONE_COLORS[z] }}>{a.calEst}h est</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleMarkDone(a.id, a.dueInDays - 1)}
                    className="text-xs bg-accent/10 text-accent px-2 py-1 rounded-md hover:bg-accent/20 shrink-0"
                  >
                    Done
                  </button>
                </div>
              );
            })}
          </div>
          {state.assignments.filter(a => a.done).length > 0 && (
            <div className="mt-3 text-xs text-ink/30">{state.assignments.filter(a => a.done).length} completed</div>
          )}
        </div>

        {/* Reward Log */}
        <div className="bg-card rounded-2xl shadow-sm p-5">
          <h2 className="font-semibold mb-3">Reward Log</h2>
          <p className="text-xs text-ink/50 mb-3">Cramming, over-cap, and late-night work earn zero coins by design.</p>
          {state.rewardEvents.length === 0 && <p className="text-sm text-ink/40">No events yet</p>}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...state.rewardEvents].reverse().map((e, i) => (
              <div key={i} className={`p-2 rounded-lg text-xs flex items-start gap-2 ${e.delta > 0 ? 'bg-healthy/10' : 'bg-surface'}`}>
                <span className={`font-mono font-bold shrink-0 ${e.delta > 0 ? 'text-healthy' : 'text-ink/30'}`}>
                  {e.delta > 0 ? `+${e.delta}` : e.delta < 0 ? `${e.delta}` : '±0'}
                </span>
                <div>
                  <div className="font-semibold text-ink/80">{e.label}</div>
                  <div className="text-ink/50">{e.reason}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
