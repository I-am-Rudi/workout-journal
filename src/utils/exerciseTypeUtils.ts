import { ExerciseType } from "../types";

export const EXERCISE_TYPES: ExerciseType[] = [
  "strength",
  "cardio",
  "flexibility",
  "other",
  "reps-only",
  "duration-only",
];

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  strength: "Strength",
  cardio: "Cardio",
  flexibility: "Flexibility",
  other: "Other",
  "reps-only": "Reps only",
  "duration-only": "Duration only",
};

export const DEFAULT_CIRCUIT_WORK_SECONDS = 30;
export const DEFAULT_CIRCUIT_REST_SECONDS = 15;

export function isRepsOnly(type: ExerciseType | undefined): boolean {
  return type === "reps-only";
}

export function isDurationOnly(type: ExerciseType | undefined): boolean {
  return type === "duration-only";
}

export function formatSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
