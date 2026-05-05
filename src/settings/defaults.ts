import {
  WorkoutTrackerSettings,
  ExerciseTemplate,
  WorkoutTemplate,
  NoteContentTemplates,
} from "../types";

export const DEFAULT_SETTINGS: WorkoutTrackerSettings = {
  defaultWorkoutFolder: "Workouts",
  exerciseLibraryFolder: "Workout Library/Exercises",
  routinesFolder: "Workout Library/Routines",
  workoutPlansFolder: "Workout Library/Plans",
  performanceCsvPath: "Workouts/workout-performance.csv",
  exerciseTemplates: [
    {
      name: "Push-up",
      type: "strength",
      defaultSets: 3,
      defaultReps: 10,
      muscleGroups: ["chest", "triceps", "shoulders"],
    },
    {
      name: "Running",
      type: "cardio",
      defaultDuration: 30,
      muscleGroups: ["legs", "cardiovascular"],
    },
    {
      name: "Bench Press",
      type: "strength",
      defaultSets: 3,
      defaultReps: 8,
      defaultWeight: 135,
      muscleGroups: ["chest", "triceps", "shoulders"],
    },
  ],
  workoutTemplates: [
    {
      name: "Push Day",
      exercises: ["Bench Press", "Push-up", "Shoulder Press"],
      estimatedDuration: 60,
    },
  ],
  enableAutoComplete: true,
  // This allows the plugin to automatically sync frontmatter with workout content from the file
  enableAutoSyncFrontmatter: true,
  // Delay in milliseconds before syncing frontmatter after manual edits in a workout file
  autoSyncDelayMs: 2000,
  dateFormat: "YYYY-MM-DD",
  weightUnit: "lb",
  // Default rest timer in seconds shown after checking off a set (0 = disabled)
  defaultRestTimerSeconds: 90,
  migration: {
    completed: false,
    exerciseCount: 0,
    routineCount: 0,
  },
  noteTemplates: {
    exercise: { frontmatter: "", body: "" },
    routine: { frontmatter: "", body: "" },
    plan: { frontmatter: "", body: "" },
    workout: { frontmatter: "", body: "" },
  },
};
