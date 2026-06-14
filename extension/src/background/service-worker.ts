import type { Assignment, AssignmentType } from '../engine/types.js';
import { calcEst, DEFAULT_MULTIPLIERS } from '../engine/estimator.js';

type ModelResult = {
  isValidTask: boolean;
  cleanTitle: string;
  topic: string;
  type: AssignmentType;
  estMinutes: number;
  difficultyScore: number;
};

const OPENAI_MODEL = 'gpt-4o-mini';
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

const DEFAULT_BLOCKED_SITES = ['instagram.com', 'discord.com', 'youtube.com'];

const BLOCKED_REDIRECT_PATH = '/src/blocked.html';

function buildRedirectRule(domain: string, ruleId: number): chrome.declarativeNetRequest.Rule {
  return {
    id: ruleId,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { extensionPath: BLOCKED_REDIRECT_PATH },
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ['main_frame'],
    },
  };
}

function pruneUnblockedSites(unblockedSites?: Record<string, number>): Record<string, number> {
  const now = Date.now();
  return Object.entries(unblockedSites ?? {}).reduce<Record<string, number>>((acc, [domain, expiry]) => {
    if (expiry > now) {
      acc[domain] = expiry;
    }
    return acc;
  }, {});
}

function isSiteUnlocked(domain: string, unblockedSites?: Record<string, number>): boolean {
  const normalized = domain.trim().toLowerCase();
  const expiry = unblockedSites?.[normalized];
  return typeof expiry === 'number' && expiry > Date.now();
}

async function applyBlockRules(blockedSites: string[]) {
  const store = await chrome.storage.local.get(['unblockedSites']);
  const unblockedSites = pruneUnblockedSites(store.unblockedSites as Record<string, number> | undefined);
  if (Object.keys(unblockedSites).length !== Object.keys(store.unblockedSites ?? {}).length) {
    await chrome.storage.local.set({ unblockedSites });
  }
  const activeBlockedSites = blockedSites.filter(site => !isSiteUnlocked(site, unblockedSites));
  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = currentRules.map(rule => rule.id);

  const addRules = activeBlockedSites.map((domain, idx) =>
    buildRedirectRule(domain, idx + 1)
  );

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules,
  });
}

async function initBlockList() {
  const store = await chrome.storage.local.get(['blockedSites']);
  const blockedSites = (store.blockedSites as string[] | undefined) ?? DEFAULT_BLOCKED_SITES;
  if (!store.blockedSites) {
    await chrome.storage.local.set({ blockedSites });
  }
  await applyBlockRules(blockedSites);
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
  active?: boolean;
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

    const dueText = (
      node.querySelector('.oPfDcb.tGZW')?.textContent ??
      node.querySelector('.oPfDcb')?.textContent ??
      node.textContent ??
      ''
    ).toLowerCase();

    const inDaysMatch = dueText.match(/in\s+(\d+)\s+day/);
    if (inDaysMatch) return Math.max(1, Number(inDaysMatch[1]));

    const text = dueText;
    if (text.includes('tomorrow')) return 1;
    if (text.includes('today')) return 1;
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
    const streamItemId = node.getAttribute('data-stream-item-id');
    if (streamItemId) return `classroom-stream-${streamItemId}`;

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
    const classroomTitle = normalizeTitle(
      node.querySelector('.y9bEQb .oDLUVd')?.textContent ??
      node.querySelector('.y9bEQb p:first-of-type')?.textContent
    );
    if (classroomTitle) return classroomTitle;

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

  const cards = Array.from(document.querySelectorAll('[data-stream-item-id][data-course-id]'));
  const assignments: Array<{
    id: string;
    title: string;
    topic: string;
    type: AssignmentType;
    dueInDays: number;
    calEst: number;
    active?: boolean;
    done: boolean;
    source: 'classroom';
  }> = [];
  const seen = new Set<string>();

  cards.forEach((card, index) => {
    const title = readTitle(card);
    if (!title || testItemPattern.test(title)) return;

    const id = makeId(card, index);
    if (seen.has(id)) return;

    const dueInDays = readDueInDays(card) ?? 3;
    const type = guessType(title);

    assignments.push({
      id,
      title,
      topic: type,
      type,
      dueInDays,
      calEst: priors[type] ?? 2,
      active: dueInDays === 1,
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

function adjustMinutesByTitle(title: string, minutes: number): number {
  const t = title.toLowerCase();
  const microTaskPattern = /\b(seat\s*change|attendance|check\s*in|sign\s*in|confirm\s*seat|seat\s*update|reflection\s*form|quarter\s*reflection|how('?|\s*)s\s*the\s*quarter|how\s*is\s*the\s*quarter|google\s*form|form|survey|poll)\b/;
  if (microTaskPattern.test(t)) {
    return Math.min(minutes, 5);
  }
  return minutes;
}

async function estimateTaskFromTitle(input: {
  title: string;
  dueInDays: number;
}, apiKey: string): Promise<ModelResult> {
  const tempAssignment: Assignment = {
    id: 'temp',
    title: input.title,
    type: 'homework',
    dueInDays: input.dueInDays,
    calEst: 2,
    done: false,
  };

  const analyzed = await analyzeWithOpenAI(tempAssignment, apiKey);
  if (!analyzed) {
    return {
      isValidTask: true,
      cleanTitle: input.title,
      topic: 'homework',
      type: 'homework',
      estMinutes: 120,
      difficultyScore: 30,
    };
  }

  return analyzed;
}

async function analyzeWithOpenAI(assignment: Assignment, apiKey: string): Promise<ModelResult | null> {
  const prompt = [
    'You classify and sanitize student assignment titles.',
    'Determine whether this is a real school task title.',
    'Reject UI labels, repeated noise, and non-task text.',
    'If valid, clean the title by removing class names and repeated day words.',
    'Keep only the assignment name itself, concise and readable.',
    `Title: ${assignment.title}`,
    'Estimate duration in MINUTES (not hours) for a typical student.',
    'Do not pad estimates. Very short admin tasks (seat change, attendance, check-in, simple form) are often 1-5 minutes.',
    'Generic Google Forms not tied to substantial subject work are usually about 5 minutes.',
    'Return strict JSON with fields: isValidTask, cleanTitle, estMinutes, topic, type, difficultyScore.',
    'isValidTask must be boolean.',
    'cleanTitle must be the cleaned assignment title.',
    'estMinutes must be between 1 and 720.',
    'type must be one of: reading, homework, quiz, essay, project, exam.',
    'difficultyScore must be between 0 and 100.',
  ].join('\n');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 220,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  const text = (data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text) as string | undefined;
  if (typeof text !== 'string') return null;

  const parsed = JSON.parse(extractJson(text)) as {
    isValidTask?: boolean;
    cleanTitle?: string;
    estMinutes?: number;
    topic?: string;
    type?: string;
    estHours?: number;
    difficultyScore?: number;
  };

  const type = sanitizeType(parsed.type ?? assignment.type);
  const fallbackMinutes = Math.round((assignment.estMinutes ?? assignment.estHours ?? assignment.calEst) * 60);
  const rawMinutes = Number(parsed.estMinutes ?? (parsed.estHours ? Number(parsed.estHours) * 60 : fallbackMinutes));
  const boundedMinutes = Math.max(1, Math.min(720, Math.round(rawMinutes)));
  const estMinutes = adjustMinutesByTitle(assignment.title, boundedMinutes);
  const difficultyScore = Math.max(0, Math.min(100, Math.round(Number(parsed.difficultyScore ?? 30))));
  const cleanTitle = (parsed.cleanTitle ?? assignment.title).toString().replace(/\s+/g, ' ').trim();

  return {
    isValidTask: Boolean(parsed.isValidTask ?? true),
    cleanTitle,
    topic: (parsed.topic ?? type).toString(),
    type,
    estMinutes,
    difficultyScore,
  };
}

async function enrichAssignments(
  assignments: Assignment[],
  apiKey?: string,
  options?: { filterInvalid?: boolean }
): Promise<Assignment[]> {
  const results: Assignment[] = [];
  const filterInvalid = options?.filterInvalid ?? false;

  for (const assignment of assignments) {
    let analyzed: ModelResult | null = null;

    if (apiKey) {
      try {
        analyzed = await analyzeWithOpenAI(assignment, apiKey);
      } catch (err) {
        console.warn('[Grape] OpenAI analysis failed:', err);
      }
    }

    if (filterInvalid && !analyzed) {
      continue;
    }

    if (filterInvalid && analyzed && (!analyzed.isValidTask || !analyzed.cleanTitle)) {
      continue;
    }

    const type = analyzed?.type ?? assignment.type;
    const estMinutes = analyzed?.estMinutes ?? assignment.estMinutes ?? Math.round((assignment.estHours ?? assignment.calEst) * 60);
    const estHoursForForecast = Math.max(0.5, estMinutes / 60);
    const title = analyzed?.cleanTitle ?? assignment.title;

    results.push({
      ...assignment,
      title,
      type,
      topic: analyzed?.topic ?? assignment.topic ?? type,
      estMinutes,
      estHours: estHoursForForecast,
      calEst: calcEst(type, estHoursForForecast, DEFAULT_MULTIPLIERS),
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
    openAiApiKey: '',
    multipliers: {
      reading: 1.0,
      homework: 1.0,
      quiz: 1.0,
      essay: 1.0,
      project: 1.0,
      exam: 1.0,
    },
  });
  await initBlockList();
});

chrome.runtime.onStartup.addListener(() => {
  applyActionIcon();
  initBlockList();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(['assignments', 'coinBalance', 'rewardEvents', 'multipliers', 'openAiApiKey', 'blockedSites'])
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

  if (msg.type === 'SET_BLOCKED_SITES') {
    (async () => {
      const blockedSites = Array.isArray(msg.blockedSites) ? msg.blockedSites : DEFAULT_BLOCKED_SITES;
      await chrome.storage.local.set({ blockedSites });
      await applyBlockRules(blockedSites);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'BUY_UNLOCK_TIME') {
    chrome.storage.local.get(['coinBalance', 'blockedSites', 'unblockedSites']).then(async store => {
      const coinBalance = Number(store['coinBalance'] ?? 0);
      const blockedSites = (store['blockedSites'] as string[] | undefined) ?? DEFAULT_BLOCKED_SITES;
      const unblockedSites = pruneUnblockedSites(store['unblockedSites'] as Record<string, number> | undefined);
      const domain = typeof msg.domain === 'string' ? msg.domain.trim().toLowerCase() : '';
      const minutes = Number(msg.minutes) || 0;
      const cost = minutes * 10;

      if (!domain || minutes < 1) {
        sendResponse({ ok: false, error: 'Invalid unlock request.' });
        return;
      }
      if (!blockedSites.includes(domain)) {
        sendResponse({ ok: false, error: 'Domain is not blocked.' });
        return;
      }
      if (coinBalance < cost) {
        sendResponse({ ok: false, error: 'Not enough coins.' });
        return;
      }

      const expiry = Date.now() + minutes * 60 * 1000;
      const nextUnblockedSites = { ...unblockedSites, [domain]: expiry };
      await chrome.storage.local.set({ coinBalance: coinBalance - cost, unblockedSites: nextUnblockedSites });
      await applyBlockRules(blockedSites);
      sendResponse({ ok: true, balance: coinBalance - cost });
    }).catch(err => sendResponse({ ok: false, error: String(err) }));

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
    chrome.storage.local.get(['assignments', 'openAiApiKey'])
      .then(async store => {
        const current = (store['assignments'] as Assignment[] | undefined) ?? [];
        const incoming = ((msg.assignments as Assignment[] | undefined) ?? [])
          .map(item => ({
            ...item,
            active: item.dueInDays === 1,
          }));
        const apiKey = (store['openAiApiKey'] as string | undefined)?.trim() ?? '';

        if (incoming.length === 0) {
          sendResponse({ ok: false, error: 'No Classroom tasks found on the current page.' });
          return;
        }

        if (!apiKey) {
          sendResponse({ ok: false, error: 'Add an OpenAI API key in Settings before importing tasks.' });
          return;
        }

        const enriched = await enrichAssignments(incoming, apiKey, { filterInvalid: true });
        const merged = mergeAssignments(current, enriched);
        await chrome.storage.local.set({ assignments: merged });
        sendResponse({ ok: true, imported: enriched.length, total: merged.length, assignments: merged });
      })
      .catch(err => sendResponse({ ok: false, error: String(err) }));

    return true;
  }

  if (msg.type === 'ANALYZE_ASSIGNMENTS') {
    chrome.storage.local.get(['assignments', 'openAiApiKey'])
      .then(async store => {
        const apiKey = (store['openAiApiKey'] as string | undefined) ?? '';
        if (!apiKey) {
          sendResponse({ ok: false, error: 'Missing OpenAI API key in settings' });
          return;
        }

        const assignments = (store['assignments'] as Assignment[] | undefined) ?? [];
        const analyzed = await enrichAssignments(assignments, apiKey, { filterInvalid: false });
        await chrome.storage.local.set({ assignments: analyzed });
        sendResponse({ ok: true, analyzed: analyzed.length });
      })
      .catch(err => sendResponse({ ok: false, error: String(err) }));

    return true;
  }

  if (msg.type === 'ESTIMATE_TASK') {
    chrome.storage.local.get(['openAiApiKey'])
      .then(async store => {
        const apiKey = (store['openAiApiKey'] as string | undefined)?.trim() ?? '';
        if (!apiKey) {
          sendResponse({ ok: false, error: 'Missing OpenAI API key in settings' });
          return;
        }

        const title = typeof msg.title === 'string' ? msg.title.trim() : '';
        const dueInDays = Math.max(1, Number(msg.dueInDays) || 3);
        if (!title) {
          sendResponse({ ok: false, error: 'Missing task title' });
          return;
        }

        const analyzed = await estimateTaskFromTitle({ title, dueInDays }, apiKey);
        if (!analyzed.isValidTask || !analyzed.cleanTitle) {
          sendResponse({ ok: false, error: 'That does not look like a valid task title.' });
          return;
        }
        const estHoursForForecast = Math.max(0.5, analyzed.estMinutes / 60);
        const calEst = calcEst(analyzed.type, estHoursForForecast, DEFAULT_MULTIPLIERS);

        sendResponse({
          ok: true,
          analyzed: {
            ...analyzed,
            estHours: estHoursForForecast,
            calEst,
          },
        });
      })
      .catch(err => sendResponse({ ok: false, error: String(err) }));

    return true;
  }
});
