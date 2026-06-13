import React, { useEffect, useState } from 'react';
import type { Assignment, RewardEvent, Multipliers, CrunchInfo } from '../engine/types';
import { paced, natural, crunch, zone, HORIZON } from '../engine/scheduler';
import { computeDrift } from '../engine/drift';
import { makeRewardEvent, assignmentDifficultyReward } from '../engine/rewards';
import { calcEst, DEFAULT_MULTIPLIERS } from '../engine/estimator';

type ImportState = 'idle' | 'loading' | 'done' | 'error';

interface State {
  assignments: Assignment[];
  coinBalance: number;
  rewardEvents: RewardEvent[];
  multipliers: Multipliers;
}

export default function Popup() {
  const [state, setState] = useState<State | null>(null);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const loadState = () => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res: State) => setState(res));
  };

  useEffect(() => {
    loadState();
  }, []);

  const importFromClassroom = async () => {
    setImportState('loading');
    setImportMessage('');

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      const url = tab?.url ?? '';

      const isClassroom = url.includes('classroom.google.com');
      const isCalendar = url.includes('calendar.google.com');

      if (!tab?.id || (!isClassroom && !isCalendar)) {
        setImportState('error');
        setImportMessage('Open Google Classroom or Google Calendar, then try again.');
        return;
      }

      const scrapeResult = await chrome.runtime.sendMessage({
        type: 'SCRAPE_IMPORT_TAB',
        tabId: tab.id,
      }) as {
        ok?: boolean;
        assignments?: Assignment[];
        error?: string;
      };

      if (!scrapeResult?.ok) {
        setImportState('error');
        setImportMessage(scrapeResult?.error ?? 'Could not read Classroom tasks from this page. Refresh the Classroom tab and try again.');
        return;
      }

      const importResult = await chrome.runtime.sendMessage({
        type: 'IMPORT_CLASSROOM_ASSIGNMENTS',
        assignments: scrapeResult.assignments ?? [],
      }) as {
        ok?: boolean;
        imported?: number;
        total?: number;
        assignments?: Assignment[];
        error?: string;
      };

      if (!importResult?.ok) {
        setImportState('error');
        setImportMessage(importResult?.error ?? 'Import failed.');
        return;
      }

      if (Array.isArray(importResult.assignments) && state) {
        setState({ ...state, assignments: importResult.assignments });
      } else {
        loadState();
      }

      const activeCount = (importResult.assignments ?? []).filter(a => !a.done).length;
      setImportState('done');
      setImportMessage(`Imported ${importResult.imported ?? 0} tasks. Active tasks: ${activeCount}. Forecast updated.`);
    } catch (err) {
      setImportState('error');
      setImportMessage(`Import failed: ${String(err)}`);
    }
  };

  const handleMarkDone = (id: string) => {
    if (!state) return;

    const assignment = state.assignments.find(a => a.id === id);
    if (!assignment) return;

    const updated = state.assignments.map(a =>
      a.id === id ? { ...a, done: true, mode: 'early' as Assignment['mode'] } : a
    );

    chrome.runtime.sendMessage({ type: 'UPDATE_ASSIGNMENTS', assignments: updated }, () => {
      const rewardScore = assignment.difficultyScore ?? Math.min(100, Math.round(assignment.calEst * 15));
      const event = makeRewardEvent(assignmentDifficultyReward(rewardScore), 'difficultyReward');
      chrome.runtime.sendMessage({ type: 'ADD_REWARD', event }, () => loadState());
    });
  };

  const handleAddTask = () => {
    if (!state) return;
    const title = newTaskTitle.trim();
    if (!title) return;

    const type: Assignment['type'] = 'homework';
    const added: Assignment = {
      id: `manual-${Date.now()}`,
      title,
      topic: 'homework',
      type,
      dueInDays: 3,
      estHours: 2,
      calEst: calcEst(type, 2, DEFAULT_MULTIPLIERS),
      difficultyScore: 30,
      source: 'mock',
      done: false,
    };

    chrome.runtime.sendMessage(
      { type: 'UPDATE_ASSIGNMENTS', assignments: [...state.assignments, added] },
      () => {
        setNewTaskTitle('');
        loadState();
      }
    );
  };

  if (!state) {
    return (
      <div className="w-72 p-4 bg-surface text-ink font-mono flex items-center justify-center h-24">
        <span className="text-sm animate-pulse">Loading...</span>
      </div>
    );
  }

  const active = [...state.assignments]
    .filter(a => !a.done)
    .sort((a, b) => a.dueInDays - b.dueInDays);
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
          <div className="flex items-center gap-2">
            <img src="/icons/icon128.png" alt="Grape" className="h-6 w-6 rounded-full" />
            <h1 className="text-lg font-bold tracking-tight text-accent">Grape</h1>
          </div>
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

      <div className="bg-card rounded-xl p-3 mb-3 shadow-sm">
        <div className="text-xs font-semibold text-ink mb-2">To-do List</div>
        {active.length === 0 && <div className="text-xs text-ink/50">No active tasks</div>}
        {active.length > 0 && (
          <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
            {active.map(task => (
              <div key={task.id} className="rounded-lg bg-surface p-2 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{task.title}</div>
                  <div className="text-[11px] text-ink/55 truncate">
                    {task.topic ?? task.type} · due +{task.dueInDays}d · {task.calEst}h
                  </div>
                </div>
                <button
                  onClick={() => handleMarkDone(task.id)}
                  className="text-[11px] bg-accent/10 text-accent px-2 py-1 rounded-md hover:bg-accent/20"
                >
                  Done
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <input
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            placeholder="New task"
            className="flex-1 rounded-md border border-ink/20 bg-white px-2 py-1.5 text-xs"
          />
          <button
            onClick={handleAddTask}
            className="rounded-md bg-accent text-white px-2.5 py-1.5 text-xs font-semibold hover:bg-accent/90"
          >
            Add Task
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={importFromClassroom}
          disabled={importState === 'loading'}
          className="flex-1 bg-ink/10 text-ink text-xs font-semibold rounded-lg py-2 hover:bg-ink/15 transition-colors disabled:opacity-60"
        >
          {importState === 'loading' ? 'Importing...' : 'Import Tasks'}
        </button>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="flex-1 bg-accent text-white text-xs font-semibold rounded-lg py-2 hover:bg-accent/90 transition-colors"
        >
          Open Dashboard
        </button>
      </div>

      {importMessage && (
        <div className={`mt-2 text-[11px] ${importState === 'error' ? 'text-overload' : 'text-ink/60'}`}>
          {importMessage}
        </div>
      )}

      {drift.state !== 'steady' && (
        <div className="mt-2 text-xs text-ink/50 text-center">
          {drift.state === 'strained' ? '⚠ You seem strained — check the dashboard' : 'Drift: watch'}
        </div>
      )}
    </div>
  );
}
