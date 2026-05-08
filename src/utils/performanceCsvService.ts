import { App, normalizePath, TFile } from "obsidian";
import { Workout, WorkoutSession } from "../types";
import { createIdFromName } from "./idUtils";

interface PerformanceCsvRow {
  timestamp: string;
  date: string;
  planId: string;
  planName: string;
  routineId: string;
  routineName: string;
  exerciseId: string;
  exerciseName: string;
  setIndex: string;
  previousReps: string;
  previousWeight: string;
  targetReps: string;
  targetWeight: string;
  actualReps: string;
  actualWeight: string;
  completed: string;
  recordType: string;
  notes: string;
  setType: string;
}

export class PerformanceCsvService {
  static readonly CSV_HEADER =
    "timestamp,date,planId,planName,routineId,routineName,exerciseId,exerciseName,setIndex,previousReps,previousWeight,targetReps,targetWeight,actualReps,actualWeight,completed,recordType,notes,setType";
  static readonly COLUMN_COUNT = PerformanceCsvService.CSV_HEADER.split(",").length;
  app: App;
  csvPath: string;
  readonly header = PerformanceCsvService.CSV_HEADER;
  readonly columnCount = PerformanceCsvService.COLUMN_COUNT;

  constructor(app: App, csvPath: string) {
    this.app = app;
    this.csvPath = this.normalizeUserPath(csvPath);
  }

  setPath(csvPath: string) {
    this.csvPath = this.normalizeUserPath(csvPath);
  }

  async ensureFile(): Promise<TFile> {
    const existing = this.app.vault.getAbstractFileByPath(this.csvPath);
    if (existing instanceof TFile) {
      return existing;
    }

    const folderPath = this.csvPath.split("/").slice(0, -1).join("/");
    if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
      try {
        await this.app.vault.createFolder(folderPath);
      } catch {
        // Vault cache may have been stale (common on iOS startup); re-check.
        if (!this.app.vault.getAbstractFileByPath(folderPath)) {
          throw new Error(`Workout Tracker: failed to create folder "${folderPath}"`);
        }
      }
    }
    try {
      return await this.app.vault.create(this.csvPath, `${this.header}\n`);
    } catch {
      // File may already exist due to stale vault cache; recover if possible.
      const existing = this.app.vault.getAbstractFileByPath(this.csvPath);
      if (existing instanceof TFile) return existing;
      throw new Error(
        `Workout Tracker: failed to create performance CSV at "${this.csvPath}". ` +
        `A non-file entry may already exist at that path.`
      );
    }
  }

  async appendSession(session: WorkoutSession): Promise<void> {
    const file = await this.ensureFile();
    const rows: string[] = [];
    const timestamp = new Date().toISOString();
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        rows.push(
          this.toCsvLine({
            timestamp,
            date: session.date,
            planId: session.planId || "",
            planName: session.planName || "",
            routineId: session.routineId || "",
            routineName: session.routineName || "",
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseName,
            setIndex: set.setIndex.toString(),
            previousReps: this.toCell(set.previousReps),
            previousWeight: this.toCell(set.previousWeight),
            targetReps: this.toCell(set.targetReps),
            targetWeight: this.toCell(set.targetWeight),
            actualReps: this.toCell(set.actualReps),
            actualWeight: this.toCell(set.actualWeight),
            completed: set.completed ? "true" : "false",
            recordType: "session",
            notes: set.notes || "",
            setType: set.setType || "default",
          })
        );
      }
    }

    if (rows.length) {
      await this.app.vault.append(file, `${rows.join("\n")}\n`);
    }
  }

  async appendImportedWorkout(workout: Workout): Promise<void> {
    const file = await this.ensureFile();
    const rows: string[] = [];
    const timestamp = workout.id
      ? new Date(parseInt(workout.id, 36)).toISOString()
      : new Date().toISOString();
    for (const exercise of workout.exercises) {
      const exerciseId = createIdFromName(exercise.name);
      for (let i = 0; i < exercise.sets.length; i++) {
        const set = exercise.sets[i];
        rows.push(
          this.toCsvLine({
            timestamp,
            date: workout.date,
            planId: "",
            planName: "",
            routineId: "",
            routineName: "",
            exerciseId,
            exerciseName: exercise.name,
            setIndex: (i + 1).toString(),
            previousReps: "",
            previousWeight: "",
            targetReps: "",
            targetWeight: "",
            actualReps: this.toCell(set.reps),
            actualWeight: this.toCell(set.weight),
            completed: "true",
            recordType: "imported",
            notes: "",
            setType: set.setType || "",
          })
        );
      }
    }
    if (rows.length) {
      await this.app.vault.append(file, `${rows.join("\n")}\n`);
    }
  }

  async appendTargetUpdate(session: WorkoutSession): Promise<void> {
    const file = await this.ensureFile();
    const rows: string[] = [];
    const timestamp = new Date().toISOString();
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (!set.completed) continue;
        rows.push(
          this.toCsvLine({
            timestamp,
            date: session.date,
            planId: session.planId || "",
            planName: session.planName || "",
            routineId: session.routineId || "",
            routineName: session.routineName || "",
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseName,
            setIndex: set.setIndex.toString(),
            previousReps: this.toCell(set.previousReps),
            previousWeight: this.toCell(set.previousWeight),
            targetReps: this.toCell(set.actualReps),
            targetWeight: this.toCell(set.actualWeight),
            actualReps: this.toCell(set.actualReps),
            actualWeight: this.toCell(set.actualWeight),
            completed: "true",
            recordType: "target_update",
            notes: set.notes || "",
            setType: set.setType || "default",
          })
        );
      }
    }
    if (rows.length) {
      await this.app.vault.append(file, `${rows.join("\n")}\n`);
    }
  }

  async getLatestByExerciseSet(
    routineId: string | undefined,
    exerciseId: string,
    setIndex: number
  ): Promise<{ reps?: number; weight?: number } | null> {
    const rows = await this.readRows();
    const matching = rows
      .filter(
        (row) =>
          row.exerciseId === exerciseId &&
          Number(row.setIndex) === setIndex &&
          (!routineId || row.routineId === routineId)
      )
      .filter((row) => row.recordType === "target_update" || row.recordType === "session" || row.recordType === "imported");

    if (!matching.length) {
      return null;
    }

    const latest = matching[matching.length - 1];
    const reps = this.parseNumber(latest.targetReps || latest.actualReps);
    const weight = this.parseNumber(latest.targetWeight || latest.actualWeight);
    return { reps, weight };
  }

  async getLatestSetsForExercise(
    routineId: string | undefined,
    exerciseId: string
  ): Promise<Array<{ setIndex: number; setType?: string; reps?: number; weight?: number }> | null> {
    const rows = await this.readRows();
    const validTypes = new Set(["session", "target_update", "imported"]);

    const tryFind = (filterByRoutine: boolean) => {
      const matching = rows.filter(
        (row) =>
          row.exerciseId === exerciseId &&
          validTypes.has(row.recordType) &&
          (!filterByRoutine || !routineId || row.routineId === routineId)
      );
      if (!matching.length) return null;

      // Find the actual latest timestamp (rows may not be sorted by timestamp).
      const latestTimestamp = matching.reduce(
        (latest, row) => (row.timestamp > latest ? row.timestamp : latest),
        matching[0].timestamp
      );
      const sessionRows = matching.filter((row) => row.timestamp === latestTimestamp);

      return sessionRows
        .map((row) => ({
          setIndex: Number(row.setIndex),
          setType: row.setType || undefined,
          reps: this.parseNumber(row.targetReps || row.actualReps),
          weight: this.parseNumber(row.targetWeight || row.actualWeight),
        }))
        .sort((a, b) => a.setIndex - b.setIndex);
    };

    // Try routine-specific history first, then fall back to any routine.
    return tryFind(true) ?? tryFind(false);
  }

  private async readRows(): Promise<PerformanceCsvRow[]> {
    const file = await this.ensureFile();
    const content = await this.app.vault.read(file);
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length <= 1) {
      return [];
    }

    const rows: PerformanceCsvRow[] = [];
    const oldColumnCount = this.columnCount - 1;
    for (const line of lines.slice(1)) {
      const cols = this.parseCsvLine(line);
      if (cols.length !== this.columnCount && cols.length !== oldColumnCount) {
        continue;
      }
      rows.push({
        timestamp: cols[0],
        date: cols[1],
        planId: cols[2],
        planName: cols[3],
        routineId: cols[4],
        routineName: cols[5],
        exerciseId: cols[6],
        exerciseName: cols[7],
        setIndex: cols[8],
        previousReps: cols[9],
        previousWeight: cols[10],
        targetReps: cols[11],
        targetWeight: cols[12],
        actualReps: cols[13],
        actualWeight: cols[14],
        completed: cols[15],
        recordType: cols[16],
        notes: cols[17],
        setType: cols.length === this.columnCount ? cols[18] : "default",
      });
    }
    return rows;
  }

  private toCsvLine(row: PerformanceCsvRow): string {
    return [
      row.timestamp,
      row.date,
      row.planId,
      row.planName,
      row.routineId,
      row.routineName,
      row.exerciseId,
      row.exerciseName,
      row.setIndex,
      row.previousReps,
      row.previousWeight,
      row.targetReps,
      row.targetWeight,
      row.actualReps,
      row.actualWeight,
      row.completed,
      row.recordType,
      row.notes,
      row.setType,
    ]
      .map((value) => this.escapeCsv(value))
      .join(",");
  }

  private parseCsvLine(line: string): string[] {
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

  private escapeCsv(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private toCell(value: number | undefined): string {
    return value === undefined ? "" : String(value);
  }

  private parseNumber(value: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private normalizeUserPath(path: string): string {
    const trimmed = path.trim();
    return trimmed ? normalizePath(trimmed) : "";
  }
}
