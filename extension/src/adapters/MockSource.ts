import type { DataSource } from './DataSource.js';
import type { Assignment } from '../engine/types.js';
import { calcEst, DEFAULT_MULTIPLIERS } from '../engine/estimator.js';

// Seed data — deliberate day 9-11 cluster to demonstrate crunch forecast
const SEED_ASSIGNMENTS: Omit<Assignment, 'calEst'>[] = [
  { id: 'mock-1', title: 'Chapter 3 Reading', type: 'reading', dueInDays: 2, done: false },
  { id: 'mock-2', title: 'Problem Set 4', type: 'homework', dueInDays: 3, done: false },
  { id: 'mock-3', title: 'Quiz: Thermodynamics', type: 'quiz', dueInDays: 4, done: false },
  { id: 'mock-4', title: 'Lab Report', type: 'homework', dueInDays: 7, done: false },
  { id: 'mock-5', title: 'History Reading', type: 'reading', dueInDays: 9, done: false },
  { id: 'mock-6', title: 'Argumentative Essay', type: 'essay', dueInDays: 10, done: false, estHours: 5.5 },
  { id: 'mock-7', title: 'Final Project', type: 'project', dueInDays: 11, done: false },
  { id: 'mock-8', title: 'Midterm Exam', type: 'exam', dueInDays: 11, done: false },
];

export class MockSource implements DataSource {
  readonly name = 'Mock (Demo)';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async fetchAssignments(): Promise<Assignment[]> {
    return SEED_ASSIGNMENTS.map(a => ({
      ...a,
      calEst: calcEst(a.type, a.estHours, DEFAULT_MULTIPLIERS),
    }));
  }
}
