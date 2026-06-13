import React, { useEffect, useState } from 'react';
import type { Assignment, RewardEvent, Multipliers, CrunchInfo } from '../engine/types';
import { paced, natural, crunch, zone, HORIZON } from '../engine/scheduler';
import { computeDrift } from '../engine/drift';

interface State {
  assignments: Assignment[];
  coinBalance: number;
  rewardEvents: RewardEvent[];
  multipliers: Multipliers;
}

export default function Popup() {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res: State) => setState(res));
  }, []);

  if (!state) {
    return (
      <div className="w-72 p-4 bg-surface text-ink font-mono flex items-center justify-center h-24">
        <span className="text-sm animate-pulse">Loading...</span>
      </div>
    );
  }

  const active = state.assignments.filter(a => !a.done);
  const pacedLoad = paced(active, HORIZON);
  const naturalLoad = natural(active, HORIZON);
  const crunchInfo: CrunchInfo = crunch(naturalLoad);
  const todayHours = pacedLoad[0] ?? 0;
  const todayZone = zone(todayHours);

  const zoneColor = {
    healthy: 'text-healthy',
    tight: 'text-tight',
    overload: 'text-overload',
  }[todayZone];

  const drift = computeDrift(state.rewardEvents.slice(-20));

  return (
    <div className="w-72 bg-surface text-ink p-4 font-sans">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold tracking-tight text-accent">Grape</h1>
        <span className="text-xs bg-gold/20 text-gold font-mono px-2 py-0.5 rounded-full">
          {state.coinBalance} coins
        </span>
      </div>

      <div className="bg-card rounded-xl p-3 mb-3 shadow-sm">
        <div className="text-xs text-ink/60 mb-1">Today's paced load</div>
        <div className={`text-3xl font-mono font-bold ${zoneColor}`}>
          {todayHours}h
        </div>
        <div className="text-xs mt-1 text-ink/50">
          {todayZone === 'healthy' && '✓ In the comfort zone'}
          {todayZone === 'tight' && '↑ A bit heavy — watchable'}
          {todayZone === 'overload' && '⚠ Over your daily cap'}
        </div>
      </div>

      {crunchInfo.startsInDays > 0 && (
        <div className="bg-overload/10 border border-overload/20 rounded-xl p-3 mb-3">
          <div className="text-xs font-semibold text-overload">
            Crunch forecast
          </div>
          <div className="text-xs text-ink/70 mt-0.5">
            {crunchInfo.runLength} overload day{crunchInfo.runLength !== 1 ? 's' : ''} starting in{' '}
            {crunchInfo.startsInDays} day{crunchInfo.startsInDays !== 1 ? 's' : ''} (peak {crunchInfo.peakHours}h)
          </div>
          <div className="text-xs text-accent mt-1">→ Pace it now to smooth the curve</div>
        </div>
      )}

      {crunchInfo.startsInDays === -1 && (
        <div className="bg-healthy/10 border border-healthy/20 rounded-xl p-3 mb-3">
          <div className="text-xs font-semibold text-healthy">No crunch detected</div>
          <div className="text-xs text-ink/60 mt-0.5">Your paced plan keeps you clear for 13 days</div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="flex-1 bg-accent text-white text-xs font-semibold rounded-lg py-2 hover:bg-accent/90 transition-colors"
        >
          Open Dashboard
        </button>
      </div>

      {drift.state !== 'steady' && (
        <div className="mt-2 text-xs text-ink/50 text-center">
          {drift.state === 'strained' ? '⚠ You seem strained — check the dashboard' : 'Drift: watch'}
        </div>
      )}
    </div>
  );
}
