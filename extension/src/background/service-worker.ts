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

async function requestCalendarContentScrape(tabId: number): Promise<Assignment[] | null> {
  try {
    const contentResult = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_CALENDAR_TASKS' }) as {
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

  const readDueInDays = (node: Element): number | null => {
    const dateEl = node.querySelector('time[datetime]');
    const parsed = parseDueInDays(dateEl?.getAttribute('datetime') ?? '');
    if (parsed !== null) return parsed;

    const text = (node.textContent ?? '').toLowerCase();
    if (text.includes('tomorrow')) return 1;
    return null;
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

  const cleanText = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim();

  const normalizeTitle = (value: string | null | undefined): string =>
    cleanText(value)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
      .replace(/^assignment\s*/i, '')
      .replace(/\s+(due|missing|assigned)\b.*$/i, '')
      .trim();

  const extractTitleFromLines = (value: string | null | undefined): string => {
    const lines = (value ?? '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^(assignment|due|missing|assigned)$/i.test(line));

    if (lines.length === 0) return '';
    return lines.sort((a, b) => b.length - a.length)[0];
  };

  const readTitle = (node: Element): string | null => {
    const direct = normalizeTitle(
      extractTitleFromLines(
      node.querySelector('[data-title]')?.textContent ??
      node.querySelector('h2, h3')?.textContent ??
      node.querySelector('[role="heading"]')?.textContent
      )
    );
    if (direct) return direct;

    const link = node.matches('a[href]') ? node : node.querySelector('a[href]');
    const aria = normalizeTitle(link?.getAttribute('aria-label'));
    if (aria) {
      const cleaned = aria
        .replace(/\b(view|open|details)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned) return cleaned;
    }

    const fallback = normalizeTitle(extractTitleFromLines(node.textContent));
    return fallback.length >= 5 ? fallback.slice(0, 140) : null;
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
    const title = readTitle(card);
    if (!title || testItemPattern.test(title)) return;

    const id = makeId(card, index);
    if (seen.has(id)) return;

    const dueInDays = readDueInDays(card);
    if (dueInDays !== 1) return;
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

function scrapeCalendarTasksInPage(): Array<{
  id: string;
  title: string;
  topic: string;
  type: AssignmentType;
  dueInDays: number;
  calEst: number;
  done: boolean;
  source: 'calendar';
}> {
  const taskLikePattern = /\b(assignment|homework|quiz|project|essay|exam|task|lab|worksheet|reading|due)\b/i;
  const testItemPattern = /\b(test|testing|sample|demo)\b/i;

  const cleanText = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim();

  const parseDueInDaysFromDate = (date: Date): number =>
    Math.max(1, Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const parseDueInDays = (node: Element, aria: string): number | null => {
    const datetimeValue = node.querySelector('time[datetime]')?.getAttribute('datetime');
    if (datetimeValue) {
      const parsed = new Date(datetimeValue);
      if (!Number.isNaN(parsed.getTime())) return parseDueInDaysFromDate(parsed);
    }

    const lower = aria.toLowerCase();
    if (lower.includes('tomorrow') || lower.includes('today')) return 1;

    const inDays = lower.match(/in\s+(\d+)\s+day/);
    if (inDays) return Math.max(1, Number(inDays[1]));

    const withYear = aria.match(/\b([A-Za-z]+\s+\d{1,2},\s*\d{4})\b/);
    if (withYear) {
      const parsed = new Date(withYear[1]);
      if (!Number.isNaN(parsed.getTime())) return parseDueInDaysFromDate(parsed);
    }

    const withoutYear = aria.match(/\b([A-Za-z]+\s+\d{1,2})\b/);
    if (withoutYear) {
      const year = new Date().getFullYear();
      const parsed = new Date(`${withoutYear[1]}, ${year}`);
      if (!Number.isNaN(parsed.getTime())) return parseDueInDaysFromDate(parsed);
    }

    return null;
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

  const readTitle = (node: Element, aria: string): string | null => {
    const direct = cleanText(
      node.querySelector('[data-event-title]')?.textContent ??
      node.querySelector('[role="heading"]')?.textContent ??
      node.querySelector('h2, h3')?.textContent
    );
    if (direct) return direct;

    const fromAria = cleanText(aria.split(',')[0]);
    return fromAria || null;
  };

  const makeId = (node: Element, fallback: number): string => {
    const eventId = node.getAttribute('data-eventid');
    if (eventId) return `calendar-${eventId}`;

    const chip = node.closest('[data-eventid]');
    const chipId = chip?.getAttribute('data-eventid');
    if (chipId) return `calendar-${chipId}`;

    return `calendar-fallback-${fallback}`;
  };

  const priors: Record<AssignmentType, number> = {
    reading: 1.5,
    homework: 2,
    quiz: 1.5,
    essay: 4,
    project: 6,
    exam: 5,
  };

  const candidates = Array.from(
    document.querySelectorAll('[data-eventid], [data-eventid] [aria-label], [role="button"][aria-label][data-eventid]')
  );
  const assignments: Array<{
    id: string;
    title: string;
    topic: string;
    type: AssignmentType;
    dueInDays: number;
    calEst: number;
    done: boolean;
    source: 'calendar';
  }> = [];
  const seen = new Set<string>();

  candidates.forEach((node, index) => {
    const aria = cleanText(node.getAttribute('aria-label'));
    const title = readTitle(node, aria);
    if (!title || testItemPattern.test(title)) return;
    if (!taskLikePattern.test(title) && !taskLikePattern.test(aria)) return;

    const dueInDays = parseDueInDays(node, aria);
    if (dueInDays === null || dueInDays > 13) return;

    const id = makeId(node, index);
    if (seen.has(id)) return;

    const type = guessType(title);
    assignments.push({
      id,
      title,
      topic: type,
      type,
      dueInDays,
      calEst: priors[type] ?? 2,
      done: false,
      source: 'calendar',
    });

    seen.add(id);
  });

  return assignments.sort((a, b) => a.dueInDays - b.dueInDays);
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
  const byId = new Map<string, Assignment>();

  for (const item of existing) {
    byId.set(item.id, item);
  }

  for (const item of incoming) {
    const prev = byId.get(item.id);
    if (prev) {
      byId.set(item.id, { ...prev, ...item, id: prev.id, done: prev.done });
      continue;
    }

    byId.set(item.id, item);
  }

  return [...byId.values()].sort((a, b) => a.dueInDays - b.dueInDays);
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

  if (msg.type === 'SCRAPE_IMPORT_TAB') {
    const tabId = Number(msg.tabId);
    if (!tabId) {
      sendResponse({ ok: false, error: 'Missing tab id' });
      return false;
    }

    (async () => {
      let url = '';
      try {
        const tab = await chrome.tabs.get(tabId);
        url = tab.url ?? '';

        const requestScrape = url.includes('calendar.google.com')
          ? requestCalendarContentScrape
          : requestClassroomContentScrape;

        const firstTry = await requestScrape(tabId);
        if (firstTry) {
          sendResponse({ ok: true, assignments: firstTry });
          return;
        }
      } catch (err) {
        sendResponse({ ok: false, error: `Could not access tab: ${String(err)}` });
        return;
      }

      if (!chrome.scripting?.executeScript) {
        sendResponse({ ok: false, error: 'Could not access tab. Reload extension and refresh the page.' });
        return;
      }

      try {
        const injected = url.includes('calendar.google.com')
          ? await chrome.scripting.executeScript({
              target: { tabId },
              func: scrapeCalendarTasksInPage,
            })
          : await chrome.scripting.executeScript({
              target: { tabId },
              func: scrapeClassroomTodoInPage,
            });

        sendResponse({ ok: true, assignments: (injected[0]?.result ?? []) as Assignment[] });
      } catch (err) {
        sendResponse({ ok: false, error: `Failed to scrape tasks: ${String(err)}` });
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
          sendResponse({ ok: false, error: 'No tasks found on the current page.' });
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
