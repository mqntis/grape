import React, { useEffect, useState, useCallback } from 'react';
import type { Assignment, RewardEvent, Multipliers } from '../engine/types';
import { paced, natural, crunch, zone, HORIZON } from '../engine/scheduler';
import { computeDrift, driftMessage, SUPPORT_LINK } from '../engine/drift';
import { rechargeSpend, makeRewardEvent } from '../engine/rewards';

interface AppState {
  assignments: Assignment[];
  coinBalance: number;
  rewardEvents: RewardEvent[];
  multipliers: Multipliers;
  claudeApiKey?: string;
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
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');

  const loadState = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res: AppState) => {
      setState(res);
      setApiKeyInput(res.claudeApiKey ?? '');
    });
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

  const handleSaveApiKey = async () => {
    await chrome.storage.local.set({ claudeApiKey: apiKeyInput.trim() });
    setSettingsMsg('Claude API key saved.');
  };

  const handleAnalyzeTasks = async () => {
    setSettingsMsg('Analyzing assignments...');
    const result = await chrome.runtime.sendMessage({ type: 'ANALYZE_ASSIGNMENTS' }) as {
      ok?: boolean;
      error?: string;
      analyzed?: number;
    };

    if (!result?.ok) {
      setSettingsMsg(result?.error ?? 'Analysis failed.');
      return;
    }

    loadState();
    setSettingsMsg(`Analyzed ${result.analyzed ?? 0} assignments with Claude.`);
  };

  const chartMax = Math.max(8, ...naturalLoad, ...pacedLoad);

  return (
    <div className="min-h-screen bg-surface text-ink font-sans p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/icons/icon128.png" alt="Grape" className="h-10 w-10 rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-accent tracking-tight">Grape</h1>
            <p className="text-sm text-ink/50">Workload pacing · not just deadline tracking</p>
          </div>
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

      <div className="bg-card rounded-2xl shadow-sm p-5 mt-6">
        <h2 className="font-semibold mb-1">Settings</h2>
        <p className="text-xs text-ink/60 mb-3">Add a Claude API key to classify tasks and score difficulty automatically.</p>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            type="password"
            placeholder="sk-ant-..."
            className="flex-1 rounded-lg border border-ink/20 bg-surface px-3 py-2 text-sm"
          />
          <button
            onClick={handleSaveApiKey}
            className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-semibold hover:bg-accent/90"
          >
            Save API Key
          </button>
          <button
            onClick={handleAnalyzeTasks}
            className="rounded-lg bg-ink/10 text-ink px-4 py-2 text-sm font-semibold hover:bg-ink/20"
          >
            Analyze Tasks
          </button>
        </div>
        {settingsMsg && <div className="mt-2 text-xs text-ink/60">{settingsMsg}</div>}
      </div>
    </div>
  );
}
