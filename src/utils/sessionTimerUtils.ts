import { WorkoutSession } from "../types";

/**
 * Elapsed-time helpers for the workout timer.
 *
 * The timer never stores a running count — it stores the wall-clock instant the
 * session started plus however long it has been paused, so the elapsed time is
 * always recomputed from `Date.now()`. That keeps it correct across a screen
 * lock, a closed popout, or an app restart that reloads the session snapshot.
 */

/** Milliseconds the session has been running, excluding paused stretches. */
export function getSessionElapsedMs(
  session: WorkoutSession,
  now: number = Date.now()
): number {
  if (session.startedAt === undefined) return 0;
  const until = session.pausedAt ?? now;
  return Math.max(0, until - session.startedAt - (session.pausedMs ?? 0));
}

export function isSessionTimerRunning(session: WorkoutSession): boolean {
  return session.startedAt !== undefined && session.pausedAt === undefined;
}

/** True when the session carries a timer at all (routine editing does not). */
export function hasSessionTimer(session: WorkoutSession): boolean {
  return session.startedAt !== undefined;
}

export function pauseSessionTimer(
  session: WorkoutSession,
  now: number = Date.now()
): void {
  if (session.startedAt === undefined || session.pausedAt !== undefined) return;
  session.pausedAt = now;
}

export function resumeSessionTimer(
  session: WorkoutSession,
  now: number = Date.now()
): void {
  if (session.startedAt === undefined || session.pausedAt === undefined) return;
  session.pausedMs = (session.pausedMs ?? 0) + Math.max(0, now - session.pausedAt);
  session.pausedAt = undefined;
}

/** `M:SS` under an hour, `H:MM:SS` above it. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** A human summary such as "1 h 4 min" for finished workouts. */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * The value written to `wj-duration`. Rounded to whole minutes, and never zero
 * for a session that actually ran, so a short workout still logs a duration.
 */
export function getSessionDurationMinutes(
  session: WorkoutSession,
  now: number = Date.now()
): number | undefined {
  if (session.startedAt === undefined) return undefined;
  const elapsedMs = getSessionElapsedMs(session, now);
  if (elapsedMs <= 0) return undefined;
  return Math.max(1, Math.round(elapsedMs / 60000));
}

/**
 * Time in which the plugin was not loaded is not workout time: a session
 * restored from the crash snapshot discounts the gap between the last snapshot
 * and now. Wall-clock time while the app is merely locked or backgrounded still
 * counts — the snapshot is refreshed throughout a live session.
 */
export function absorbOfflineGap(
  session: WorkoutSession,
  savedAt: number | null,
  now: number = Date.now()
): void {
  if (session.startedAt === undefined || savedAt === null) return;
  if (session.pausedAt !== undefined) return;
  const gap = now - savedAt;
  if (gap <= 0) return;
  session.pausedMs = (session.pausedMs ?? 0) + gap;
}
