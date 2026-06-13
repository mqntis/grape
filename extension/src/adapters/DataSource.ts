import type { Assignment } from '../engine/types.js';

export interface DataSource {
  name: string;
  isAvailable(): Promise<boolean>;
  fetchAssignments(): Promise<Assignment[]>;
}
