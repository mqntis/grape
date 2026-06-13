export type AssignmentType = 'reading' | 'homework' | 'quiz' | 'essay' | 'project' | 'exam';

export interface Assignment {
  id: string;
  title: string;
  type: AssignmentType;
  topic?: string;
  dueInDays: number;
  estHours?: number;
  calEst: number;
  difficultyScore?: number;
  source?: 'mock' | 'canvas' | 'classroom';
  done: boolean;
  mode?: 'early' | 'cram';
  actualHours?: number;
  completedAt?: number; // timestamp ms
}

export type Zone = 'healthy' | 'tight' | 'overload';

export interface DayLoad {
  hours: number;
  zone: Zone;
}

export interface ForecastResult {
  paced: number[];
  natural: number[];
  crunch: CrunchInfo;
}

export interface CrunchInfo {
  runLength: number;
  peakHours: number;
  startsInDays: number; // -1 if no crunch
}

export interface RewardEvent {
  type: string;
  delta: number;
  label: string;
  reason: string;
  timestamp: number;
}

export type DriftState = 'steady' | 'watch' | 'strained';

export interface DriftResult {
  state: DriftState;
  cramCount: number;
  lateNightCount: number;
  backlog: number;
}

export interface Multipliers {
  reading: number;
  homework: number;
  quiz: number;
  essay: number;
  project: number;
  exam: number;
}
