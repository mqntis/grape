import type { DataSource } from './DataSource.js';
import type { Assignment } from '../engine/types.js';
import { calcEst, DEFAULT_MULTIPLIERS } from '../engine/estimator.js';

const TASK_LIKE_PATTERN = /\b(assignment|homework|quiz|project|essay|exam|task|lab|worksheet|reading|due)\b/i;
const TEST_ITEM_PATTERN = /\b(test|testing|sample|demo)\b/i;

function parseDueInDaysFromDate(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function parseDueInDays(node: Element, aria: string): number | null {
  const datetimeValue = node.querySelector('time[datetime]')?.getAttribute('datetime');
  if (datetimeValue) {
    const parsed = new Date(datetimeValue);
    if (!Number.isNaN(parsed.getTime())) return parseDueInDaysFromDate(parsed);
  }

  const lower = aria.toLowerCase();
  if (lower.includes('tomorrow')) return 1;
  if (lower.includes('today')) return 1;

  const inDays = lower.match(/in\s+(\d+)\s+day/);
  if (inDays) {
    return Math.max(1, Number(inDays[1]));
  }

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
}

function guessType(title: string): Assignment['type'] {
  const t = title.toLowerCase();
  if (t.includes('exam') || t.includes('midterm') || t.includes('final')) return 'exam';
  if (t.includes('quiz')) return 'quiz';
  if (t.includes('essay') || t.includes('paper')) return 'essay';
  if (t.includes('project')) return 'project';
  if (t.includes('read') || t.includes('chapter')) return 'reading';
  return 'homework';
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function readTitle(node: Element, aria: string): string | null {
  const direct = cleanText(
    node.querySelector('[data-event-title]')?.textContent ??
    node.querySelector('[role="heading"]')?.textContent ??
    node.querySelector('h2, h3')?.textContent
  );
  if (direct) return direct;

  const fromAria = cleanText(aria.split(',')[0]);
  return fromAria || null;
}

function makeId(node: Element, fallback: number): string {
  const eventId = node.getAttribute('data-eventid');
  if (eventId) return `calendar-${eventId}`;

  const chip = node.closest('[data-eventid]');
  const chipId = chip?.getAttribute('data-eventid');
  if (chipId) return `calendar-${chipId}`;

  return `calendar-fallback-${fallback}`;
}

export class CalendarSource implements DataSource {
  readonly name = 'Google Calendar';

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'calendar.google.com';
  }

  async fetchAssignments(): Promise<Assignment[]> {
    const candidates = Array.from(
      document.querySelectorAll('[data-eventid], [data-eventid] [aria-label], [role="button"][aria-label][data-eventid]')
    );

    const assignments: Assignment[] = [];
    const seen = new Set<string>();

    candidates.forEach((node, index) => {
      const aria = cleanText(node.getAttribute('aria-label'));
      const title = readTitle(node, aria);
      if (!title || TEST_ITEM_PATTERN.test(title)) return;
      if (!TASK_LIKE_PATTERN.test(title) && !TASK_LIKE_PATTERN.test(aria)) return;

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
        calEst: calcEst(type, undefined, DEFAULT_MULTIPLIERS),
        done: false,
        source: 'calendar',
      });
      seen.add(id);
    });

    return assignments.sort((a, b) => a.dueInDays - b.dueInDays);
  }
}
