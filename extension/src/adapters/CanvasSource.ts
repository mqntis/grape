import type { DataSource } from './DataSource.js';
import type { Assignment } from '../engine/types.js';
import { calcEst, DEFAULT_MULTIPLIERS } from '../engine/estimator.js';

interface CanvasPlannerItem {
  plannable_id: number;
  plannable_type: string;
  plannable_date: string;
  plannable: {
    id: number;
    title: string;
    submission_types?: string[];
    points_possible?: number;
  };
}

function guessType(item: CanvasPlannerItem): Assignment['type'] {
  const types = item.plannable.submission_types ?? [];
  const title = item.plannable.title.toLowerCase();
  if (title.includes('exam') || title.includes('midterm') || title.includes('final exam')) return 'exam';
  if (title.includes('quiz')) return 'quiz';
  if (title.includes('essay') || title.includes('paper')) return 'essay';
  if (title.includes('project')) return 'project';
  if (title.includes('reading')) return 'reading';
  if (types.includes('online_quiz')) return 'quiz';
  return 'homework';
}

export class CanvasSource implements DataSource {
  readonly name = 'Canvas LMS';
  private token?: string;

  constructor(token?: string) {
    this.token = token;
  }

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    return window.location.hostname.endsWith('.instructure.com');
  }

  async fetchAssignments(): Promise<Assignment[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch('/api/v1/planner/items?per_page=50', { headers });
    if (!res.ok) throw new Error(`Canvas API error: ${res.status}`);
    const items: CanvasPlannerItem[] = await res.json();

    const now = Date.now();
    return items
      .filter(item => item.plannable_type === 'assignment')
      .map(item => {
        const dueMs = new Date(item.plannable_date).getTime();
        const dueInDays = Math.max(1, Math.ceil((dueMs - now) / (1000 * 60 * 60 * 24)));
        const type = guessType(item);
        return {
          id: `canvas-${item.plannable_id}`,
          title: item.plannable.title,
          type,
          dueInDays,
          calEst: calcEst(type, undefined, DEFAULT_MULTIPLIERS),
          done: false,
        };
      });
  }
}
