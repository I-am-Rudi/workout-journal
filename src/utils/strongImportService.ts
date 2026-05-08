import { App, TFile } from "obsidian";
import { Workout, ExerciseDefinition } from "../types";
import { PerformanceCsvService } from "./performanceCsvService";
import { WorkoutFileService } from "./workoutFileService";
import { DefinitionFileService } from "./definitionFileService";
import { createIdFromName } from "./idUtils";

// ---------------------------------------------------------------------------
// Shared CSV helpers
// ---------------------------------------------------------------------------

/**
 * Splits a CSV document into logical lines, correctly handling quoted fields
 * that may contain embedded newlines.
 */
export function splitCsvLines(csvContent: string): string[] {
  const result: string[] = [];
  let pending = "";
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    if (char === '"') {
      if (inQuotes && csvContent[i + 1] === '"') {
        pending += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        pending += char;
      }
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && csvContent[i + 1] === "\n") i++;
      if (pending.length > 0) {
        result.push(pending);
        pending = "";
      }
    } else {
      pending += char;
    }
  }
  if (pending.length > 0) result.push(pending);
  return result;
}

/**
 * Parses a single CSV line into cells, handling double-quote escaping and
 * quoted fields that may contain commas.
 */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

// ---------------------------------------------------------------------------
function deriveIdFromStrongDate(dateStr: string): string {
  // dateStr format: "YYYY-MM-DD HH:MM:SS"
  const ms = Date.parse(dateStr.replace(" ", "T"));
  if (!isNaN(ms)) return ms.toString(36);
  // Deterministic fallback: hash the raw string so re-imports of the same
  // invalid date always produce the same ID.
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (Math.imul(31, hash) + dateStr.charCodeAt(i)) | 0;
  }
  return `fallback-${(hash >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Parsing functions (pure, exported for testability)
// ---------------------------------------------------------------------------

/**
 * Parses the content of a Strong-app `workouts.csv` into an array of Workouts.
 * Each unique Date+Workout Name combination becomes one Workout.
 */
export function parseStrongWorkoutsCsv(csvContent: string): Workout[] {
  const lines = splitCsvLines(csvContent);
  if (lines.length < 2) return [];

  const headerCols = parseCsvLine(lines[0]);
  const idx = (name: string) => headerCols.indexOf(name);

  const iDate = idx("Date");
  const iWorkoutName = idx("Workout Name");
  const iDuration = idx("Duration");
  const iExerciseName = idx("Exercise Name");
  const iSetOrder = idx("Set Order");
  const iWeight = idx("Weight");
  const iReps = idx("Reps");
  const iDistance = idx("Distance");
  const iSeconds = idx("Seconds");
  const iNotes = idx("Notes");
  const iWorkoutNotes = idx("Workout Notes");

  type RawSet = {
    setOrder: number;
    reps?: number;
    weight?: number;
    duration?: number;
    distance?: number;
    notes?: string;
  };
  type RawExercise = { name: string; sets: RawSet[] };
  type RawWorkout = {
    date: string;
    dateTime: string;
    name: string;
    durationSeconds: number;
    notes: string;
    exercises: RawExercise[];
  };

  const workoutOrder: string[] = [];
  const workoutMap = new Map<string, RawWorkout>();

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);

    const dateTime = iDate >= 0 ? cols[iDate] ?? "" : "";
    const workoutName = iWorkoutName >= 0 ? cols[iWorkoutName] ?? "" : "";
    // Use \x00 as separator — guaranteed not to appear in CSV field values
    // (Strong never emits null bytes), so this key is collision-free.
    const key = `${dateTime}\x00${workoutName}`;

    if (!workoutMap.has(key)) {
      workoutOrder.push(key);
      workoutMap.set(key, {
        date: dateTime.split(" ")[0] ?? "",
        dateTime,
        name: workoutName,
        durationSeconds:
          iDuration >= 0 ? parseFloat(cols[iDuration] ?? "") || 0 : 0,
        notes: iWorkoutNotes >= 0 ? cols[iWorkoutNotes] ?? "" : "",
        exercises: [],
      });
    }

    const workout = workoutMap.get(key);
    if (!workout) {
      continue;
    }
    const exerciseName =
      iExerciseName >= 0 ? (cols[iExerciseName] ?? "").trim() : "";
    if (!exerciseName) continue;

    let exercise = workout.exercises.find((e) => e.name === exerciseName);
    if (!exercise) {
      exercise = { name: exerciseName, sets: [] };
      workout.exercises.push(exercise);
    }

    const repsRaw = iReps >= 0 ? cols[iReps] ?? "" : "";
    const weightRaw = iWeight >= 0 ? cols[iWeight] ?? "" : "";
    const distanceRaw = iDistance >= 0 ? cols[iDistance] ?? "" : "";
    const secondsRaw = iSeconds >= 0 ? cols[iSeconds] ?? "" : "";
    const setOrderRaw = iSetOrder >= 0 ? cols[iSetOrder] ?? "" : "";
    const notesRaw = iNotes >= 0 ? cols[iNotes] ?? "" : "";

    const reps = repsRaw !== "" ? parseInt(repsRaw, 10) : NaN;
    const weight = weightRaw !== "" ? parseFloat(weightRaw) : NaN;
    const distance = distanceRaw !== "" ? parseFloat(distanceRaw) : NaN;
    const duration = secondsRaw !== "" ? parseInt(secondsRaw, 10) : NaN;

    exercise.sets.push({
      setOrder: setOrderRaw !== "" ? parseInt(setOrderRaw, 10) : exercise.sets.length + 1,
      reps: !isNaN(reps) ? reps : undefined,
      weight: !isNaN(weight) ? weight : undefined,
      distance: !isNaN(distance) ? distance : undefined,
      duration: !isNaN(duration) ? duration : undefined,
      notes: notesRaw || undefined,
    });
  }

  return workoutOrder.map((key) => {
    const w = workoutMap.get(key);
    if (!w) {
      return {
        id: deriveIdFromStrongDate(key),
        date: key.substring(0, 10),
        name: "Unknown workout",
        exercises: [],
      };
    }
    return {
      id: deriveIdFromStrongDate(w.dateTime),
      date: w.date,
      name: w.name,
      duration: w.durationSeconds
        ? Math.round(w.durationSeconds / 60)
        : undefined,
      notes: w.notes || undefined,
      exercises: w.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets
          .sort((a, b) => a.setOrder - b.setOrder)
          .map(({ setOrder: _order, ...set }) => set),
      })),
    };
  });
}

/**
 * Derives a minimal ExerciseDefinition for every unique exercise name found
 * across the provided workouts.  Definitions are returned in first-encounter
 * order.  Each definition is created with type "other" and no muscle groups;
 * the user can edit the generated exercise notes afterwards.
 */
export function deriveExerciseDefsFromWorkouts(
  workouts: Workout[]
): ExerciseDefinition[] {
  const defByName = new Map<string, ExerciseDefinition>();
  const latestDateByName = new Map<string, string>();
  const defs: ExerciseDefinition[] = [];

  const lastSetValues = (sets: { reps?: number; weight?: number }[]) => {
    let lastPerformedReps: number | undefined;
    let lastPerformedWeight: number | undefined;
    for (const set of sets) {
      if (typeof set.reps === "number" && !isNaN(set.reps)) {
        lastPerformedReps = set.reps;
      }
      if (typeof set.weight === "number" && !isNaN(set.weight)) {
        lastPerformedWeight = set.weight;
      }
    }
    return { lastPerformedReps, lastPerformedWeight };
  };

  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const name = exercise.name.trim();
      if (!name) continue;
      const { lastPerformedReps, lastPerformedWeight } = lastSetValues(
        exercise.sets
      );

      const existingDef = defByName.get(name);
      if (!existingDef) {
        const def: ExerciseDefinition = {
          id: createIdFromName(name),
          name,
          type: "other",
          muscleGroups: [],
          lastPerformedReps,
          lastPerformedWeight,
        };
        defs.push(def);
        defByName.set(name, def);
        latestDateByName.set(name, workout.date);
        continue;
      }

      const latestDate = latestDateByName.get(name) ?? "";
      if (workout.date > latestDate) {
        existingDef.lastPerformedReps = lastPerformedReps;
        existingDef.lastPerformedWeight = lastPerformedWeight;
        latestDateByName.set(name, workout.date);
        continue;
      }

      if (workout.date === latestDate) {
        if (lastPerformedReps !== undefined) {
          existingDef.lastPerformedReps = lastPerformedReps;
        }
        if (lastPerformedWeight !== undefined) {
          existingDef.lastPerformedWeight = lastPerformedWeight;
        }
      }
    }
  }

  return defs;
}

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------

export interface StrongImportOptions {
  createWorkoutNotes: boolean;
  addToPerformanceCsv: boolean;
  importExerciseDefinitions: boolean;
  skipDuplicates: boolean;
}

export interface StrongImportResult {
  workoutsCreated: number;
  workoutsSkipped: number;
  exercisesImported: number;
  errors: string[];
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface WorkoutsSummary {
  uniqueExerciseCount: number;
  dateRange: { earliest: string; latest: string } | null;
}

export class StrongImportService {
  constructor(
    private app: App,
    private performanceCsvService: PerformanceCsvService,
    private workoutFileService: WorkoutFileService,
    private definitionFileService: DefinitionFileService
  ) {}

  summarize(workouts: Workout[]): WorkoutsSummary {
    const exercises = new Set<string>();
    let earliest = "";
    let latest = "";
    for (const w of workouts) {
      for (const ex of w.exercises) exercises.add(ex.name);
      if (!earliest || w.date < earliest) earliest = w.date;
      if (!latest || w.date > latest) latest = w.date;
    }
    return {
      uniqueExerciseCount: exercises.size,
      dateRange: workouts.length ? { earliest, latest } : null,
    };
  }

  async importAll(
    workouts: Workout[],
    exerciseDefs: ExerciseDefinition[],
    options: StrongImportOptions
  ): Promise<StrongImportResult> {
    const result: StrongImportResult = {
      workoutsCreated: 0,
      workoutsSkipped: 0,
      exercisesImported: 0,
      errors: [],
    };

    for (const workout of workouts) {
      // --- Workout notes ---
      if (options.createWorkoutNotes) {
        try {
          const filePath = this.workoutFileService.getWorkoutFilePath(workout);
          if (
            options.skipDuplicates &&
            this.app.vault.getAbstractFileByPath(filePath) instanceof TFile
          ) {
            result.workoutsSkipped++;
          } else {
            await this.workoutFileService.saveWorkoutSilently(workout);
            result.workoutsCreated++;
          }
        } catch (err) {
          result.errors.push(
            `Workout "${workout.name}" (${workout.date}): ${getErrorMessage(err)}`
          );
        }
      }

      // --- Performance CSV ---
      if (options.addToPerformanceCsv) {
        try {
          await this.performanceCsvService.appendImportedWorkout(workout);
        } catch (err) {
          result.errors.push(
            `CSV for "${workout.name}" (${workout.date}): ${getErrorMessage(err)}`
          );
        }
      }
    }

    // --- Exercise definitions ---
    if (options.importExerciseDefinitions) {
      for (const def of exerciseDefs) {
        try {
          await this.definitionFileService.createExerciseDefinition(def);
          result.exercisesImported++;
        } catch (err) {
          result.errors.push(
            `Exercise "${def.name}": ${getErrorMessage(err)}`
          );
        }
      }
    }

    return result;
  }
}
