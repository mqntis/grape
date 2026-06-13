import type { DataSource } from './DataSource.js';
import type { Assignment } from '../engine/types.js';
import { calcEst, DEFAULT_MULTIPLIERS } from '../engine/estimator.js';

const TEST_ITEM_PATTERN = /\b(test|testing|sample|demo)\b/i;

function parseDueInDays(value: string): number | null {
  const dueMs = new Date(value).getTime();
  if (Number.isNaN(dueMs)) return null;
  return Math.max(1, Math.ceil((dueMs - Date.now()) / (1000 * 60 * 60 * 24)));
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

function makeId(node: Element, fallback: number): string {
  const courseworkId = node.getAttribute('data-coursework-id');
  if (courseworkId) return `classroom-${courseworkId}`;

  const link = node.matches('a[href]') ? node : node.querySelector('a[href]');
  if (link) {
    const href = link.getAttribute('href') ?? '';
    const match = href.match(/\/a\/(\d+)/);
    if (match) return `classroom-${match[1]}`;
    const cleaned = href.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60);
    if (cleaned) return `classroom-${cleaned}`;
  }

  return `classroom-fallback-${fallback}`;
}

function readTitle(node: Element): string {
  const titleEl =
    node.querySelector('[data-title]') ??
    node.querySelector('h2, h3') ??
    node.querySelector('[role="heading"]') ??
    node.querySelector('span');
  const title = titleEl?.textContent?.trim() ?? '';
  return title || 'Untitled assignment';
}

export class ClassroomSource implements DataSource {
  readonly name = 'Google Classroom';

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'classroom.google.com';
  }

  async fetchAssignments(): Promise<Assignment[]> {
    const cards = Array.from(
      document.querySelectorAll('[data-coursework-id], a[href*="/a/"], [role="listitem"]')
    );
    const assignments: Assignment[] = [];
    const seen = new Set<string>();

    cards.forEach((card, index) => {
      const title = readTitle(card);
      if (!title || TEST_ITEM_PATTERN.test(title)) return;

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
        calEst: calcEst(type, undefined, DEFAULT_MULTIPLIERS),
        done: false,
        source: 'classroom',
      });

      seen.add(id);
    });

    return assignments.sort((a, b) => a.dueInDays - b.dueInDays);
  }
}
