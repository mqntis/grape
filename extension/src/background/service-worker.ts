import type { Assignment, AssignmentType } from '../engine/types.js';
import { calcEst, DEFAULT_MULTIPLIERS } from '../engine/estimator.js';

type ClaudeResult = {
  topic: string;
  type: AssignmentType;
  estHours: number;
  difficultyScore: number;
};

const CLAUDE_MODEL = 'claude-3-5-haiku-latest';
const ACTION_ICON_PATH = {
  16: 'icons/icon16.png',
  19: 'icons/icon19.png',
  24: 'icons/icon24.png',
  32: 'icons/icon32.png',
  38: 'icons/icon38.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

function applyActionIcon(): void {
  chrome.action.setIcon({ path: ACTION_ICON_PATH });
}

function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Timed out waiting for Classroom tab reload'));
    }, timeoutMs);

    const onUpdated = (updatedTabId: number, info: { status?: string }) => {
      if (updatedTabId !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function requestClassroomContentScrape(tabId: number): Promise<Assignment[] | null> {
  try {
    const contentResult = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_CLASSROOM_TODO' }) as {
      ok?: boolean;
      assignments?: Assignment[];
    };

    if (contentResult?.ok) {
      return contentResult.assignments ?? [];
    }
  } catch {
  }

  return null;
}

function scrapeClassroomTodoInPage(): Array<{
  id: string;
  title: string;
  topic: string;
  type: AssignmentType;
  dueInDays: number;
  calEst: number;
  done: boolean;
  source: 'classroom';
}> {
  const testItemPattern = /\b(test|testing|sample|demo)\b/i;

  const parseDueInDays = (value: string): number | null => {
    const dueMs = new Date(value).getTime();
    if (Number.isNaN(dueMs)) return null;
    return Math.max(1, Math.ceil((dueMs - Date.now()) / (1000 * 60 * 60 * 24)));
  };

  const guessType = (title: string): AssignmentType => {
    const t = title.toLowerCase();
    if (t.includes('exam') || t.includes('midterm') || t.includes('final')) return 'exam';
    if (t.includes('quiz')) return 'quiz';
    if (t.includes('essay') || t.includes('paper')) return 'essay';
    if (t.includes('project')) return 'project';
    if (t.includes('read') || t.includes('chapter')) return 'reading';
    return 'homework';
  };

  const priors: Record<AssignmentType, number> = {
    reading: 1.5,
    homework: 2,
    quiz: 1.5,
    essay: 4,
    project: 6,
    exam: 5,
  };

  const makeId = (node: Element, fallback: number): string => {
    const courseworkId = node.getAttribute('data-coursework-id');
    if (courseworkId) return `classroom-${courseworkId}`;

    const link = node.matches('a[href]') ? node : node.querySelector('a[href]');
    if (link) {
      const href = link.getAttribute('href') ?? '';
      const match = href.match(/\/a\/(\d+)/);
      if (match) return `classroom-${match[1]}`;
    }

    return `classroom-fallback-${fallback}`;
  };

  const cards = Array.from(document.querySelectorAll('[data-coursework-id], a[href*="/a/"], [role="listitem"]'));
  const assignments: Array<{
    id: string;
    title: string;
    topic: string;
    type: AssignmentType;
    dueInDays: number;
    calEst: number;
    done: boolean;
    source: 'classroom';
  }> = [];
  const seen = new Set<string>();

  cards.forEach((card, index) => {
    const titleEl = card.querySelector('[data-title]') ?? card.querySelector('h2, h3') ?? card.querySelector('[role="heading"]') ?? card.querySelector('span');
    const title = titleEl?.textContent?.trim() ?? '';
    if (!title || testItemPattern.test(title)) return;

    const id = makeId(card, index);
    if (seen.has(id)) return;

    const dateEl = card.querySelector('time[datetime]');
    const dueInDays = parseDueInDays(dateEl?.getAttribute('datetime') ?? '') ?? 3;
    const type = guessType(title);

    assignments.push({
      id,
      title,
      topic: type,
      type,
      dueInDays,
      calEst: priors[type] ?? 2,
      done: false,
      source: 'classroom',
    });

    seen.add(id);
  });

  return assignments;
}

applyActionIcon();

function sanitizeType(value: string): AssignmentType {
  const normalized = value.toLowerCase().trim();
  if (normalized === 'reading') return 'reading';
  if (normalized === 'quiz') return 'quiz';
  if (normalized === 'essay') return 'essay';
  if (normalized === 'project') return 'project';
  if (normalized === 'exam') return 'exam';
  return 'homework';
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object returned');
  return text.slice(start, end + 1);
}

async function analyzeWithClaude(assignment: Assignment, apiKey: string): Promise<ClaudeResult | null> {
  const prompt = [
    'Classify this student assignment and estimate workload.',
    `Title: ${assignment.title}`,
    `Due in days: ${assignment.dueInDays}`,
    'Return JSON only: {"topic":"...","type":"reading|homework|quiz|essay|project|exam","estHours":number,"difficultyScore":0-100}',
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 220,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string') return null;

  const parsed = JSON.parse(extractJson(text)) as {
    topic?: string;
    type?: string;
    estHours?: number;
    difficultyScore?: number;
  };

  const type = sanitizeType(parsed.type ?? assignment.type);
  const estHours = Math.max(0.5, Math.min(12, Number(parsed.estHours ?? assignment.calEst)));
  const difficultyScore = Math.max(0, Math.min(100, Math.round(Number(parsed.difficultyScore ?? 30))));

  return {
    topic: (parsed.topic ?? type).toString(),
    type,
    estHours,
    difficultyScore,
  };
}

async function enrichAssignments(assignments: Assignment[], apiKey?: string): Promise<Assignment[]> {
  const results: Assignment[] = [];

  for (const assignment of assignments) {
    let analyzed: ClaudeResult | null = null;

    if (apiKey) {
      try {
        analyzed = await analyzeWithClaude(assignment, apiKey);
      } catch (err) {
        console.warn('[Grape] Claude analysis failed:', err);
      }
    }

    const type = analyzed?.type ?? assignment.type;
    const estHours = analyzed?.estHours ?? assignment.estHours ?? assignment.calEst;

    results.push({
      ...assignment,
      type,
      topic: analyzed?.topic ?? assignment.topic ?? type,
      estHours,
      calEst: calcEst(type, estHours, DEFAULT_MULTIPLIERS),
      difficultyScore: analyzed?.difficultyScore ?? assignment.difficultyScore,
    });
  }

  return results;
}

function mergeAssignments(existing: Assignment[], incoming: Assignment[]): Assignment[] {
  const byKey = new Map<string, Assignment>();

  for (const item of existing) {
    byKey.set(item.id, item);
    byKey.set(item.title.toLowerCase(), item);
  }

  for (const item of incoming) {
    const existingById = byKey.get(item.id);
    const existingByTitle = byKey.get(item.title.toLowerCase());
    const prev = existingById ?? existingByTitle;

    if (prev) {
      const merged = { ...prev, ...item, id: prev.id, done: prev.done };
      byKey.set(prev.id, merged);
      byKey.set(prev.title.toLowerCase(), merged);
      byKey.set(item.title.toLowerCase(), merged);
      continue;
    }

    byKey.set(item.id, item);
    byKey.set(item.title.toLowerCase(), item);
  }

  const unique = new Map<string, Assignment>();
  for (const value of byKey.values()) {
    unique.set(value.id, value);
  }

  return [...unique.values()].sort((a, b) => a.dueInDays - b.dueInDays);
}

chrome.runtime.onInstalled.addListener(async () => {
  applyActionIcon();
  await chrome.storage.local.set({
    assignments: [],
    coinBalance: 0,
    rewardEvents: [],
    claudeApiKey: '',
    multipliers: {
      reading: 1.0,
      homework: 1.0,
      quiz: 1.0,
      essay: 1.0,
      project: 1.0,
      exam: 1.0,
    },
  });
});

chrome.runtime.onStartup.addListener(() => {
  applyActionIcon();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(['assignments', 'coinBalance', 'rewardEvents', 'multipliers', 'claudeApiKey'])
      .then(sendResponse);
    return true;
  }
  if (msg.type === 'UPDATE_ASSIGNMENTS') {
    chrome.storage.local.set({ assignments: msg.assignments }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'ADD_REWARD') {
    chrome.storage.local.get(['coinBalance', 'rewardEvents']).then(store => {
      const balance = (store['coinBalance'] as number ?? 0) + msg.event.delta;
      const events = [...(store['rewardEvents'] as unknown[] ?? []), msg.event];
      chrome.storage.local.set({ coinBalance: balance, rewardEvents: events })
        .then(() => sendResponse({ ok: true, balance }));
    });
    return true;
  }

  if (msg.type === 'SCRAPE_CLASSROOM_TODO_TAB') {
    const tabId = Number(msg.tabId);
    if (!tabId) {
      sendResponse({ ok: false, error: 'Missing tab id' });
      return false;
    }

    (async () => {
      try {
        const firstTry = await requestClassroomContentScrape(tabId);
        if (firstTry) {
          sendResponse({ ok: true, assignments: firstTry });
          return;
        }

        await chrome.tabs.reload(tabId);
        await waitForTabComplete(tabId);

        const secondTry = await requestClassroomContentScrape(tabId);
        if (secondTry) {
          sendResponse({ ok: true, assignments: secondTry });
          return;
        }
      } catch (err) {
        sendResponse({ ok: false, error: `Could not reach Classroom tab: ${String(err)}` });
        return;
      }

      if (!chrome.scripting?.executeScript) {
        sendResponse({ ok: false, error: 'Could not access Classroom tab. Reload extension, refresh Classroom, and try again.' });
        return;
      }

      try {
        const injected = await chrome.scripting.executeScript({
          target: { tabId },
          func: scrapeClassroomTodoInPage,
        });

        sendResponse({ ok: true, assignments: (injected[0]?.result ?? []) as Assignment[] });
      } catch (err) {
        sendResponse({ ok: false, error: `Failed to scrape Classroom: ${String(err)}` });
      }
    })();

    return true;
  }

  if (msg.type === 'IMPORT_CLASSROOM_ASSIGNMENTS') {
    chrome.storage.local.get(['assignments', 'claudeApiKey'])
      .then(async store => {
        const current = (store['assignments'] as Assignment[] | undefined) ?? [];
        const incoming = (msg.assignments as Assignment[] | undefined) ?? [];
        if (incoming.length === 0) {
          sendResponse({ ok: false, error: 'No Classroom tasks found on the current page.' });
          return;
        }
        const enriched = await enrichAssignments(incoming, store['claudeApiKey'] as string | undefined);
        const merged = mergeAssignments(current, enriched);
        await chrome.storage.local.set({ assignments: merged });
        sendResponse({ ok: true, imported: enriched.length, total: merged.length, assignments: merged });
      })
      .catch(err => sendResponse({ ok: false, error: String(err) }));

    return true;
  }

  if (msg.type === 'ANALYZE_ASSIGNMENTS') {
    chrome.storage.local.get(['assignments', 'claudeApiKey'])
      .then(async store => {
        const apiKey = (store['claudeApiKey'] as string | undefined) ?? '';
        if (!apiKey) {
          sendResponse({ ok: false, error: 'Missing Claude API key in settings' });
          return;
        }

        const assignments = (store['assignments'] as Assignment[] | undefined) ?? [];
        const analyzed = await enrichAssignments(assignments, apiKey);
        await chrome.storage.local.set({ assignments: analyzed });
        sendResponse({ ok: true, analyzed: analyzed.length });
      })
      .catch(err => sendResponse({ ok: false, error: String(err) }));

    return true;
  }
});
