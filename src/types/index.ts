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
  enableSetCompletionVibrationFeedback: boolean;
  enableSetCompletionSoundFeedback: boolean;
  enableRestTimerVibrationFeedback: boolean;
  enableRestTimerSoundFeedback: boolean;
  migration: MigrationState;
  noteTemplates: NoteContentTemplates;
}

export interface MigrationState {
  completed: boolean;
  migratedAt?: string;
  exerciseCount: number;
  routineCount: number;
}

/**
 * `reps-only` exercises track reps without a weight; `duration-only` exercises
 * track a time window (in seconds) only and are the sole type allowed inside a
 * circuit routine.
 */
export type ExerciseType =
  | "strength"
  | "cardio"
  | "flexibility"
  | "other"
  | "reps-only"
  | "duration-only";

export interface ExerciseTemplate {
  name: string;
  type: ExerciseType;
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

export type SetType = "default" | "warmup" | "dropset" | "myoreps";

export interface ExerciseSet {
  reps?: number;
  weight?: number;
  duration?: number;
  distance?: number;
  restTime?: number;
  setType?: SetType;
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
  type: ExerciseType;
  muscleGroups: string[];
  notes?: string;
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
  lastPerformedReps?: number;
  lastPerformedWeight?: number;
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
  setType?: SetType;
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
  /**
   * Stored as `wj-circle`. When true the routine is a circuit: it may only
   * contain `duration-only` exercises and runs in the guided circuit player
   * instead of the regular session view.
   */
  isCircle?: boolean;
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
  setType?: SetType;
}

export interface WorkoutSessionExercise {
  exerciseId: string;
  exerciseName: string;
  exerciseType?: ExerciseType;
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
  routineEditMode?: boolean;
  editingRoutineFilePath?: string;
  /** True when the source routine is a circuit (`wj-circle`). */
  isCircle?: boolean;
  /** Number of times the circuit is repeated. Only set for circuit sessions. */
  circuitRounds?: number;
}

export interface SessionFinishOptions {
  fillUncompletedSets: boolean;
  storeNewTargets: boolean;
  routineChangeStrategy: "overwrite" | "create_new" | "ignore";
}

/** One leg of a running circuit: either a work interval or the pause after it. */
export interface CircuitStep {
  round: number;
  exerciseIndex: number;
  exerciseName: string;
  kind: "work" | "rest";
  seconds: number;
}

/** Per-exercise work/rest times collected in the post-circuit overview. */
export interface CircuitTimingAdjustment {
  exerciseId: string;
  exerciseName: string;
  workSeconds: number;
  restSeconds: number;
}
