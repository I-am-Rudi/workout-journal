import {
  RoutineDefinition,
  SessionFinishOptions,
  Workout,
  WorkoutSession,
  WorkoutSessionExercise,
} from "../types";
import { PerformanceCsvService } from "./performanceCsvService";
import { generateId } from "./idUtils";

export class WorkoutSessionService {
  csvService: PerformanceCsvService;

  constructor(csvService: PerformanceCsvService) {
    this.csvService = csvService;
  }

  async createSessionFromRoutine(
    routine: RoutineDefinition,
    options?: { planId?: string; planName?: string; exerciseNotesMap?: Map<string, string>; exerciseFilePathMap?: Map<string, string> }
  ): Promise<WorkoutSession> {
    const exercises: WorkoutSessionExercise[] = [];
    for (const exercise of routine.exercises) {
      const sets = [];
      for (let i = 0; i < exercise.sets.length; i++) {
        const setIndex = i + 1;
        const historical = await this.csvService.getLatestByExerciseSet(
          routine.id,
          exercise.exerciseId,
          setIndex
        );
        sets.push({
          setIndex,
          previousReps: historical?.reps,
          previousWeight: historical?.weight,
          targetReps: exercise.sets[i]?.reps,
          targetWeight: exercise.sets[i]?.weight,
          actualReps: exercise.sets[i]?.reps,
          actualWeight: exercise.sets[i]?.weight,
          duration: exercise.sets[i]?.duration,
          distance: exercise.sets[i]?.distance,
          restTime: exercise.sets[i]?.restTime,
          completed: false,
          notes: "",
        });
      }
      exercises.push({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        sets,
        completed: false,
        notes: exercise.notes,
        exerciseNotes: options?.exerciseNotesMap?.get(exercise.exerciseId),
        exerciseFilePath: options?.exerciseFilePathMap?.get(exercise.exerciseId),
      });
    }

    return {
      id: generateId(),
      date: new Date().toISOString().split("T")[0],
      name: routine.name,
      routineId: routine.id,
      routineName: routine.name,
      planId: options?.planId,
      planName: options?.planName,
      exercises,
      hasRoutineChanges: false,
    };
  }

  applyTargetUpdates(session: WorkoutSession): WorkoutSession {
    return {
      ...session,
      exercises: session.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => {
          if (!set.completed) {
            return set;
          }
          return {
            ...set,
            targetReps: set.actualReps,
            targetWeight: set.actualWeight,
          };
        }),
      })),
    };
  }

  fillUncompletedSets(session: WorkoutSession): WorkoutSession {
    return {
      ...session,
      exercises: session.exercises.map((exercise) => ({
        ...exercise,
        completed: true,
        sets: exercise.sets.map((set) =>
          set.completed
            ? set
            : {
                ...set,
                actualReps: set.actualReps ?? set.targetReps,
                actualWeight: set.actualWeight ?? set.targetWeight,
                completed: true,
              }
        ),
      })),
    };
  }

  toWorkoutLog(session: WorkoutSession): Workout {
    return {
      id: session.id,
      date: session.date,
      name: session.name,
      sourceRoutineId: session.routineId,
      sourcePlanId: session.planId,
      exercises: session.exercises.map((exercise) => ({
        name: exercise.exerciseName,
        notes: exercise.notes,
        sets: exercise.sets.map((set) => ({
          reps: set.actualReps,
          weight: set.actualWeight,
          duration: set.duration,
          distance: set.distance,
          restTime: set.restTime,
        })),
      })),
    };
  }

  mergeSessionIntoRoutine(
    routine: RoutineDefinition,
    session: WorkoutSession,
    finishOptions: SessionFinishOptions
  ): RoutineDefinition {
    // "ignore" keeps the original routine exercise list; only target values on
    // matching exercises may be refreshed when storeNewTargets is enabled.
    // "overwrite" and "create_new" adopt the session's exercise order/list so
    // that exercises added, removed, or reordered during the session are
    // reflected in the resulting routine definition.
    const allowStructureChanges = finishOptions.routineChangeStrategy !== "ignore";

    const buildSets = (
      sessionExercise: WorkoutSessionExercise,
      existingSets: { reps?: number; weight?: number; duration?: number; distance?: number; restTime?: number }[]
    ) => {
      const limit = allowStructureChanges ? sessionExercise.sets.length : existingSets.length;
      const sets = [];
      for (let i = 0; i < limit; i++) {
        const existing = existingSets[i] || {};
        const fromSession = sessionExercise.sets[i];
        if (!fromSession) {
          sets.push(existing);
          continue;
        }
        sets.push({
          reps:
            finishOptions.storeNewTargets && fromSession.completed
              ? fromSession.actualReps
              : fromSession.targetReps ?? existing.reps,
          weight:
            finishOptions.storeNewTargets && fromSession.completed
              ? fromSession.actualWeight
              : fromSession.targetWeight ?? existing.weight,
          duration: fromSession.duration ?? existing.duration,
          distance: fromSession.distance ?? existing.distance,
          restTime: fromSession.restTime ?? existing.restTime,
        });
      }
      return sets;
    };

    if (allowStructureChanges) {
      // Use the session's exercise list as the authoritative source so that
      // exercises added, removed, or reordered during the session are preserved.
      const routineByExerciseId = new Map(
        routine.exercises.map((entry) => [entry.exerciseId, entry])
      );
      const nextExercises = session.exercises.map((sessionExercise) => {
        const existing = routineByExerciseId.get(sessionExercise.exerciseId);
        const sets = buildSets(sessionExercise, existing?.sets ?? []);
        return existing
          ? { ...existing, notes: sessionExercise.notes, sets }
          : {
              exerciseId: sessionExercise.exerciseId,
              exerciseName: sessionExercise.exerciseName,
              sets,
              notes: sessionExercise.notes,
            };
      });
      return { ...routine, exercises: nextExercises };
    }

    // "ignore" strategy: keep routine exercise list but refresh target values.
    const byExerciseId = new Map(
      session.exercises.map((exercise) => [exercise.exerciseId, exercise])
    );
    const nextExercises = routine.exercises.map((entry) => {
      const sessionExercise = byExerciseId.get(entry.exerciseId);
      if (!sessionExercise) {
        return entry;
      }
      return {
        ...entry,
        notes: sessionExercise.notes,
        sets: buildSets(sessionExercise, entry.sets),
      };
    });

    return { ...routine, exercises: nextExercises };
  }
}
