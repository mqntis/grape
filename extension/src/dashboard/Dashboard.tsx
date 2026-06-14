import React, { useEffect, useState, useCallback } from 'react';
import type { Assignment, RewardEvent, Multipliers } from '../engine/types';
import { paced, natural, crunch, zone, HORIZON } from '../engine/scheduler';
import { computeDrift, driftMessage, SUPPORT_LINK } from '../engine/drift';

interface AppState {
  assignments: Assignment[];
  coinBalance: number;
  rewardEvents: RewardEvent[];
  multipliers: Multipliers;
  openAiApiKey?: string;
  blockedSites?: string[];
}

const DEFAULT_BLOCKED_SITES = ['instagram.com', 'discord.com', 'youtube.com'];
const NON_REMOVABLE_SITES = new Set(DEFAULT_BLOCKED_SITES);
const GOOGLE_SHARED_FAVICON_BASE = 'https://www.google.com/s2/favicons';

function getFaviconUrl(domain: string): string {
  return `${GOOGLE_SHARED_FAVICON_BASE}?domain=${encodeURIComponent(domain)}&sz=64`;
}

const normalizeBlockedSite = (site: string) =>
  site.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

const normalizeBlockedSites = (sites: string[] | undefined) =>
  Array.from(new Set([...(sites ?? []), ...DEFAULT_BLOCKED_SITES]
    .map(normalizeBlockedSite)
    .filter(Boolean)));

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

function formatDuration(task: Assignment): string {
  const mins = task.estMinutes;
  if (typeof mins === 'number' && mins > 0) {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  return `${task.calEst}h`;
}

function formatLoadHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M6 9.5V21h12V9.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h16l-1.5 12h-13z" />
      <path d="M9 8a3 3 0 1 1 6 0" />
    </svg>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [blockedSites, setBlockedSites] = useState<string[]>(DEFAULT_BLOCKED_SITES);
  const [newBlockedSite, setNewBlockedSite] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  const [blockListMsg, setBlockListMsg] = useState('');
  const [shopMsg, setShopMsg] = useState('');
  const [page, setPage] = useState<'dashboard' | 'settings' | 'shop'>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const search = new URLSearchParams(window.location.search).get('page');
    return search === 'settings' || search === 'shop' ? search : 'dashboard';
  });
  const [shopMinutes, setShopMinutes] = useState<Record<string, number>>({});

  const loadState = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res: AppState) => {
      setState(res);
      setApiKeyInput((res as any).openAiApiKey ?? '');
      setBlockedSites(normalizeBlockedSites(res.blockedSites));
      setShopMsg('');
    });
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (!changes.coinBalance && !changes.rewardEvents && !changes.assignments) return;
      loadState();
    };

    const handleWindowFocus = () => loadState();
    const handleVisibility = () => {
      if (!document.hidden) loadState();
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadState]);

  if (!state) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-ink/50 font-mono">Loading Grape...</div>
      </div>
    );
  }

  const active = state.assignments.filter(a => !a.done);
  const allAssignments = [...state.assignments].sort((a, b) => a.dueInDays - b.dueInDays);
  const pacedLoad = paced(active, HORIZON);
  const naturalLoad = natural(active, HORIZON);
  const crunchInfo = crunch(naturalLoad);
  const drift = computeDrift(state.rewardEvents.slice(-20));
  const driftMsg = driftMessage(drift.state);
  const chartMax = Math.max(8, ...naturalLoad, ...pacedLoad);

  const handleSaveApiKey = async () => {
    await chrome.storage.local.set({ openAiApiKey: apiKeyInput.trim() });
    setSettingsMsg('OpenAI API key saved.');
  };

  const updateBlockedSites = (nextSites: string[]) => {
    const normalized = normalizeBlockedSites(nextSites);
    setBlockedSites(normalized);
    chrome.runtime.sendMessage({ type: 'SET_BLOCKED_SITES', blockedSites: normalized }, () => {
      setBlockListMsg('Block list saved.');
      setSettingsMsg('Blocked sites updated.');
    });
  };

  const handleAddBlockedSite = () => {
    const site = normalizeBlockedSite(newBlockedSite);
    if (!site) return;
    if (blockedSites.includes(site)) {
      setNewBlockedSite('');
      return;
    }

    updateBlockedSites([...blockedSites, site]);
    setNewBlockedSite('');
  };

  const handleRemoveBlockedSite = (site: string) => {
    if (NON_REMOVABLE_SITES.has(site)) {
      return;
    }

    updateBlockedSites(blockedSites.filter(item => item !== site));
  };

  const handleSaveBlockedSites = () => {
    updateBlockedSites(blockedSites);
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
    setSettingsMsg(`Analyzed ${result.analyzed ?? 0} assignments with OpenAI.`);
  };

  const handleBuyUnlock = async (site: string) => {
    const minutes = shopMinutes[site] ?? 5;
    const cost = minutes * 10;
    chrome.runtime.sendMessage({ type: 'BUY_UNLOCK_TIME', domain: site, minutes }, (result: { ok?: boolean; error?: string }) => {
      if (!result?.ok) {
        setShopMsg(result?.error ?? 'Purchase failed.');
        return;
      }
      setShopMsg(`Unlocked ${site} for ${minutes} minute${minutes !== 1 ? 's' : ''}. ${cost} coins spent.`);
      loadState();
    });
  };

  return (
    <div className="min-h-screen bg-surface text-ink font-sans p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/icons/icon128.png" alt="Grape" className="h-10 w-10 rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-accent tracking-tight">Grape</h1>
            <p className="text-sm text-ink/50">Workload pacing · not just deadline tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage('dashboard')}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-ink/10 px-3 py-2 text-xs font-semibold text-ink hover:bg-ink/5"
          >
            <HomeIcon />
            Home
          </button>
          <button
            type="button"
            onClick={() => setPage('settings')}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-ink/10 px-3 py-2 text-xs font-semibold text-ink hover:bg-ink/5"
          >
            <SettingsIcon />
            Settings
          </button>
          <button
            type="button"
            onClick={() => setPage('shop')}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-ink/10 px-3 py-2 text-xs font-semibold text-ink hover:bg-ink/5"
          >
            <ShopIcon />
            Shop
          </button>
          <div className="rounded-xl border border-yellow-300 bg-yellow-100 px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-yellow-800">Coin Balance</div>
            <div className="text-lg font-mono font-bold text-yellow-900 leading-tight">{state.coinBalance}</div>
          </div>
        </div>
      </div>

      {page === 'settings' && (
        <div className="space-y-6 mb-6">
          <div className="bg-card rounded-2xl shadow-sm p-5">
            <h2 className="font-semibold mb-3">API Key</h2>
            <p className="text-xs text-ink/60 mb-3">Add an OpenAI API key to classify tasks and score difficulty automatically.</p>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                type="password"
                placeholder="sk-..."
                className="flex-1 rounded-lg border border-ink/20 bg-surface px-3 py-2 text-sm"
              />
              <button
                onClick={handleSaveApiKey}
                className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-semibold hover:bg-accent/90"
              >
                Save API Key
              </button>
            </div>
            {settingsMsg && <div className="mt-2 text-xs text-ink/60">{settingsMsg}</div>}
          </div>

          <div className="bg-card rounded-2xl shadow-sm p-5">
            <h2 className="font-semibold mb-3">Blocked Sites</h2>
            <p className="text-xs text-ink/60 mb-3">These sites are blocked automatically on startup and redirected to the Grape focus screen.</p>
            <div className="space-y-2 mb-4">
              {blockedSites.length > 0 ? blockedSites.map(site => (
                <div key={site} className="flex items-center justify-between rounded-xl bg-surface p-3">
                  <span className="text-sm text-ink truncate">{site}</span>
                  {NON_REMOVABLE_SITES.has(site) ? (
                    <span className="text-xs text-ink/40">Required</span>
                  ) : (
                    <button
                      onClick={() => handleRemoveBlockedSite(site)}
                      className="text-xs text-ink/50 hover:text-ink"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )) : (
                <div className="text-sm text-ink/50">No blocked sites configured.</div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={newBlockedSite}
                onChange={e => setNewBlockedSite(e.target.value)}
                placeholder="e.g. facebook.com"
                className="flex-1 rounded-lg border border-ink/20 bg-surface px-3 py-2 text-sm"
              />
              <button
                onClick={handleAddBlockedSite}
                className="rounded-lg bg-ink/10 text-ink px-4 py-2 text-sm font-semibold hover:bg-ink/20"
              >
                Add site
              </button>
            </div>
            <button
              onClick={handleSaveBlockedSites}
              className="mt-4 rounded-lg bg-accent text-white px-4 py-2 text-sm font-semibold hover:bg-accent/90"
            >
              Save Block List
            </button>
            {blockListMsg && <div className="mt-2 text-xs text-ink/60">{blockListMsg}</div>}
          </div>
        </div>
      )}

      {page === 'shop' && (
        <div className="bg-card rounded-2xl shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Shop</h2>
              <p className="text-xs text-ink/60">Unlock blocked sites temporarily. 10 coins per minute.</p>
            </div>
            <div className="text-right text-xs text-ink/50">Balance: {state.coinBalance} coins</div>
          </div>
          <div className="space-y-3">
            {blockedSites.map(site => {
              const minutes = shopMinutes[site] ?? 5;
              return (
                <div key={site} className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden">
                        <img
                          src={getFaviconUrl(site)}
                          alt={`${site} favicon`}
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-ink">{site}</div>
                        <div className="text-xs text-ink/60">{minutes * 10} coins for {minutes} minute{minutes !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleBuyUnlock(site)}
                      className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-semibold hover:bg-accent/90"
                    >
                      Buy
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setShopMinutes(curr => ({ ...curr, [site]: Math.max(1, (curr[site] ?? 5) - 1) }))}
                      className="rounded-full border border-ink/20 bg-white px-3 py-2 text-lg"
                    >
                      -
                    </button>
                    <div className="min-w-[80px] rounded-full border border-ink/20 bg-white px-4 py-2 text-center font-semibold text-ink">
                      {minutes}
                    </div>
                    <button
                      onClick={() => setShopMinutes(curr => ({ ...curr, [site]: (curr[site] ?? 5) + 1 }))}
                      className="rounded-full border border-ink/20 bg-white px-3 py-2 text-lg"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {shopMsg && <div className="mt-4 text-xs text-ink/60">{shopMsg}</div>}
        </div>
      )}

      {page === 'dashboard' && (
        <>
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

          {crunchInfo.startsInDays > 0 && (
            <div className="mb-4 bg-overload/10 border border-overload/30 rounded-xl p-4">
              <div className="font-semibold text-overload text-sm">Crunch Forecast</div>
              <div className="text-sm text-ink/70 mt-1">
                Your natural cram pattern creates <strong>{crunchInfo.runLength} consecutive overload day{crunchInfo.runLength !== 1 ? 's' : ''}</strong> starting in{' '}
                <strong>{crunchInfo.startsInDays} day{crunchInfo.startsInDays !== 1 ? 's' : ''}</strong> (peak: <span className="font-mono">{formatLoadHours(crunchInfo.peakHours)}</span>).
                The paced plan below smooths this out.
              </div>
            </div>
          )}

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
                      <div
                        className="flex-1 border border-dashed border-ink/30 rounded-t-sm"
                        style={{ height: nHeight, minHeight: nh > 0 ? '2px' : '0' }}
                      />
                      <div
                        className="flex-1 rounded-t-sm"
                        style={{ height: pHeight, backgroundColor: ZONE_COLORS[pz], minHeight: ph > 0 ? '2px' : '0' }}
                      />
                    </div>
                    <div className="text-[9px] text-ink/40 font-mono truncate w-full text-center">{DAY_LABELS[i]}</div>
                    {ph > 0 && <div className="text-[8px] font-mono text-ink/60">{formatLoadHours(ph)}</div>}
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

          <div className="bg-card rounded-2xl shadow-sm p-5 mb-6">
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

          <div className="bg-card rounded-2xl shadow-sm p-5 mb-6">
            <h2 className="font-semibold mb-3">All Tasks</h2>
            {allAssignments.length === 0 && <p className="text-sm text-ink/40">No tasks imported yet.</p>}
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {allAssignments.map(task => {
                const subject = (task.topic ?? task.type).split(/\s+/).slice(0, 2).join(' ');
                const status = task.done ? 'Completed' : (task.active ?? true) ? 'Active' : 'Upcoming';
                const statusTone = task.done
                  ? 'text-healthy bg-healthy/10'
                  : (task.active ?? true)
                    ? 'text-tight bg-tight/10'
                    : 'text-ink/60 bg-surface';

                return (
                  <div key={task.id} className="rounded-xl border border-ink/10 bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{task.title}</div>
                        <div className="text-xs text-ink/55">{subject} · {formatDuration(task)}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
