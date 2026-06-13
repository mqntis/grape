import type { DataSource } from './DataSource.js';
import type { Assignment } from '../engine/types.js';
import { calcEst, DEFAULT_MULTIPLIERS } from '../engine/estimator.js';

export class ClassroomSource implements DataSource {
  readonly name = 'Google Classroom';

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'classroom.google.com';
  }

  async fetchAssignments(): Promise<Assignment[]> {
    // DOM scrape — runs from content script context
    const cards = document.querySelectorAll('[data-coursework-id]');
    const now = Date.now();
    const assignments: Assignment[] = [];

    cards.forEach(card => {
      const titleEl = card.querySelector('[data-title]') ?? card.querySelector('h2, h3');
      const dateEl = card.querySelector('time[datetime]');
      if (!titleEl || !dateEl) return;

      const title = titleEl.textContent?.trim() ?? 'Untitled';
      const dueMs = new Date(dateEl.getAttribute('datetime') ?? '').getTime();
      if (isNaN(dueMs)) return;

      const dueInDays = Math.max(1, Math.ceil((dueMs - now) / (1000 * 60 * 60 * 24)));
      const type: Assignment['type'] = 'homework';

      assignments.push({
        id: `classroom-${card.getAttribute('data-coursework-id')}`,
        title,
        type,
        dueInDays,
        calEst: calcEst(type, undefined, DEFAULT_MULTIPLIERS),
        done: false,
      });
    });

    return assignments;
  }
}
