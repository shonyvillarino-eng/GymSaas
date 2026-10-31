/* ---------------- API shapes ---------------- */

export type RoutineStatusValue = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface ExerciseEntry {
  id: string;
  exerciseOrder: number;
  sets: number;
  reps: string;
  restSeconds: number;
  weightKg: string | null;
  tempo: string | null;
  instructions: string | null;
  notes: string | null;
  exercise: {
    id: string;
    name: string;
    muscleGroup: string;
    equipment: string[];
    instructions: string | null;
    imageUrl: string | null;
    isActive: boolean;
  };
}

export interface RoutineDayRecord {
  id: string;
  name: string;
  description: string | null;
  dayOrder: number;
  restDay: boolean;
  exercises: ExerciseEntry[];
}

export interface Routine {
  id: string;
  name: string;
  description: string | null;
  status: RoutineStatusValue;
  version: number;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  member: { id: string; fullName: string } | null;
  instructor: { id: string; fullName: string } | null;
  author: string | null;
  dayCount: number;
  days?: RoutineDayRecord[];
  canModify?: boolean;
}

export interface RoutinePage {
  data: Routine[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  exerciseType: string;
  equipment: string[];
  instructions: string | null;
  imageUrl: string | null;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExercisePage {
  data: Exercise[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  equipment: string[];
}

export interface SnapshotExercise {
  order: number;
  exerciseId: string;
  name: string;
  muscleGroup: string;
  equipment: string[];
  sets: number;
  reps: string;
  restSeconds: number;
  weightKg: string | null;
  tempo: string | null;
  instructions: string | null;
  notes: string | null;
}

export interface RoutineSnapshot {
  routineId: string;
  name: string;
  description: string | null;
  status: RoutineStatusValue;
  version: number;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  member: { id: string; fullName: string } | null;
  instructor: { id: string; fullName: string } | null;
  days: Array<{
    name: string;
    description: string | null;
    order: number;
    restDay: boolean;
    exercises: SnapshotExercise[];
  }>;
}

export interface RoutineVersionRow {
  id: string;
  version: number;
  status: RoutineStatusValue;
  reason: string | null;
  createdAt: string;
  author: string;
  snapshot: RoutineSnapshot;
}

/* ---------------- Labels ---------------- */

export const MUSCLE_GROUPS = [
  'CHEST',
  'BACK',
  'LEGS',
  'SHOULDERS',
  'ARMS',
  'CORE',
  'GLUTES',
  'FULL_BODY',
  'CARDIO',
  'OTHER',
] as const;

export const MUSCLE_GROUP_LABELS: Record<string, string> = {
  CHEST: 'Chest',
  BACK: 'Back',
  LEGS: 'Legs',
  SHOULDERS: 'Shoulders',
  ARMS: 'Arms',
  CORE: 'Core',
  GLUTES: 'Glutes',
  FULL_BODY: 'Full body',
  CARDIO: 'Cardio',
  OTHER: 'Other',
};

export const ROUTINE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
};

export const VERSION_REASON_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Edited',
  ACTIVATE: 'Activated',
  ARCHIVE: 'Archived',
  SUPERSEDED: 'Replaced by a new routine',
  MIGRATION: 'Imported',
};

export const EXERCISE_TYPE_LABELS: Record<string, string> = {
  STRENGTH: 'Strength',
  CARDIO: 'Cardio',
  FLEXIBILITY: 'Flexibility',
  BALANCE: 'Balance',
  PLYOMETRICS: 'Plyometrics',
  OTHER: 'Other',
};

export function routineBadge(status: string): string {
  if (status === 'ACTIVE') return 'bg-primary/10 text-primary';
  if (status === 'DRAFT') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
}

export function routineStatusLabel(status: string): string {
  return ROUTINE_STATUS_LABELS[status] ?? status;
}

export function formatPrescription(entry: { sets: number; reps: string; restSeconds: number; weightKg: string | null; tempo: string | null }) {
  const parts = [`${entry.sets}×${entry.reps}`];
  if (entry.restSeconds > 0) parts.push(`${entry.restSeconds}s rest`);
  if (entry.weightKg) parts.push(`${Number(entry.weightKg)} kg`);
  if (entry.tempo) parts.push(`tempo ${entry.tempo}`);
  return parts.join(' · ');
}

export function formatDayRange(start: string | null, end: string | null): string {
  const format = (value: string) => new Date(value).toLocaleDateString();
  if (start && end) return `${format(start)} → ${format(end)}`;
  if (start) return `From ${format(start)}`;
  if (end) return `Until ${format(end)}`;
  return 'No dates set';
}
