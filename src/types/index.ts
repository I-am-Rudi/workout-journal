export interface NoteContentTemplate {
  /** YAML text whose parsed properties are merged into the generated frontmatter. */
  frontmatter?: string;
  /** Markdown text appended beneath the generated note body. */
  body?: string;
}

export interface NoteContentTemplates {
  exercise?: NoteContentTemplate;
  routine?: NoteContentTemplate;
  plan?: NoteContentTemplate;
  workout?: NoteContentTemplate;
}

export interface WorkoutTrackerSettings {
  defaultWorkoutFolder: string;
  exerciseLibraryFolder: string;
  routinesFolder: string;
  workoutPlansFolder: string;
  performanceCsvPath: string;
  exerciseTemplates: ExerciseTemplate[];
  workoutTemplates: WorkoutTemplate[];
  enableAutoComplete: boolean;
  enableAutoSyncFrontmatter: boolean;
  autoSyncDelayMs: number;
  dateFormat: string;
  weightUnit: "kg" | "lb";
  defaultRestTimerSeconds: number;
  migration: MigrationState;
  noteTemplates: NoteContentTemplates;
}

export interface MigrationState {
  completed: boolean;
  migratedAt?: string;
  exerciseCount: number;
  routineCount: number;
}

export interface ExerciseTemplate {
  name: string;
  type: "strength" | "cardio" | "flexibility" | "other";
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
  defaultDuration?: number;
  muscleGroups: string[];
}

export interface WorkoutTemplate {
  name: string;
  exercises: string[];
  estimatedDuration: number;
}

export interface Exercise {
  name: string;
  sets: ExerciseSet[];
  notes?: string;
}

export interface ExerciseSet {
  reps?: number;
  weight?: number;
  duration?: number;
  distance?: number;
  restTime?: number;
}

export interface Workout {
  id: string;
  date: string;
  name: string;
  exercises: Exercise[];
  duration?: number;
  notes?: string;
  sourceRoutineId?: string;
  sourcePlanId?: string;
}

export type WorkoutTrackerNoteType =
  | "exercise"
  | "routine"
  | "plan"
  | "workout";

export interface ExerciseDefinition {
  id: string;
  name: string;
  type: "strength" | "cardio" | "flexibility" | "other";
  muscleGroups: string[];
  notes?: string;
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
  defaultDuration?: number;
  defaultDistance?: number;
  filePath?: string;
}

export interface RoutineExerciseSetTarget {
  reps?: number;
  weight?: number;
  duration?: number;
  distance?: number;
  restTime?: number;
}

export interface RoutineExerciseEntry {
  exerciseId: string;
  exerciseName: string;
  exerciseLink?: string;
  sets: RoutineExerciseSetTarget[];
  notes?: string;
}

export interface RoutineDefinition {
  id: string;
  name: string;
  exercises: RoutineExerciseEntry[];
  estimatedDuration?: number;
  notes?: string;
  planTags?: string[];
  filePath?: string;
}

export interface WorkoutPlanRoutineEntry {
  routineId: string;
  routineName: string;
  routineLink?: string;
  day?: string;
  notes?: string;
}

export interface WorkoutPlanDefinition {
  id: string;
  name: string;
  routines: WorkoutPlanRoutineEntry[];
  notes?: string;
  filePath?: string;
}

export interface WorkoutSessionSet {
  setIndex: number;
  previousReps?: number;
  previousWeight?: number;
  targetReps?: number;
  targetWeight?: number;
  actualReps?: number;
  actualWeight?: number;
  duration?: number;
  distance?: number;
  restTime?: number;
  completed: boolean;
  notes?: string;
}

export interface WorkoutSessionExercise {
  exerciseId: string;
  exerciseName: string;
  sets: WorkoutSessionSet[];
  completed: boolean;
  notes?: string;
  exerciseNotes?: string;
  exerciseFilePath?: string;
  restTimerSeconds?: number;
}

export interface WorkoutSession {
  id: string;
  date: string;
  name: string;
  routineId?: string;
  routineName?: string;
  planId?: string;
  planName?: string;
  exercises: WorkoutSessionExercise[];
  notes?: string;
  hasRoutineChanges: boolean;
}

export interface SessionFinishOptions {
  fillUncompletedSets: boolean;
  storeNewTargets: boolean;
  routineChangeStrategy: "overwrite" | "create_new" | "ignore";
}
