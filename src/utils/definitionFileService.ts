import {
  App,
  normalizePath,
  TFile,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import { generateId } from "./idUtils";
import {
  ExerciseDefinition,
  ExerciseType,
  RoutineDefinition,
  RoutineExerciseEntry,
  WorkoutPlanDefinition,
  WorkoutPlanRoutineEntry,
  WorkoutTrackerSettings,
} from "../types";
import { parseTemplateFrontmatter, appendTemplateBody } from "./noteTemplateUtils";
import { EXERCISE_TYPES } from "./exerciseTypeUtils";
import {
  parseExerciseNote,
  renderExerciseBody,
  writeDescriptionSection,
} from "./exerciseNoteSections";
import { isImageMode } from "./exerciseMediaService";

export class DefinitionFileService {
  app: App;
  settings: WorkoutTrackerSettings;

  constructor(app: App, settings: WorkoutTrackerSettings) {
    this.app = app;
    this.settings = settings;
  }

  setSettings(settings: WorkoutTrackerSettings) {
    this.settings = settings;
  }

  async ensureFolders(): Promise<void> {
    await this.ensureFolder(this.settings.exerciseLibraryFolder);
    await this.ensureFolder(this.settings.routinesFolder);
    await this.ensureFolder(this.settings.workoutPlansFolder);
  }

  /**
   * Creates a new exercise note, or updates an existing one **without touching
   * its body**.
   *
   * Exercise notes hold a description and the user's own notes below the
   * frontmatter, so an edit must never re-render the whole file. Frontmatter
   * goes through `processFrontMatter`; the body is only written when the note is
   * being created, or when a description is explicitly supplied.
   */
  async createExerciseDefinition(def: ExerciseDefinition): Promise<TFile | null> {
    await this.ensureFolders();
    const folder = this.requireConfiguredFolder(
      this.settings.exerciseLibraryFolder,
      "Exercise library folder"
    );

    const existing = this.findExistingExerciseFile(def, folder);
    if (existing) {
      await this.app.fileManager.processFrontMatter(existing, (frontmatter: Record<string, unknown>) => {
        this.applyExerciseFrontmatter(frontmatter, def);
      });
      if (def.description !== undefined) {
        await this.app.vault.process(existing, (content) =>
          writeDescriptionSection(content, def.description ?? "")
        );
      }
      return existing;
    }

    const path = this.findFreeExercisePath(def.name, folder);
    return this.app.vault.create(path, this.renderExerciseDefinition(def));
  }

  /**
   * Resolves an exercise to the note that already represents it: its recorded
   * path first, then a note at the name-derived path carrying the same id.
   *
   * A note sitting at that path with a *different* id belongs to someone else's
   * exercise — "3/4 sit-up" and "3-4 sit up" both sanitise to `34-sit-up` — so
   * it is left alone and the caller writes to a suffixed path instead.
   */
  private findExistingExerciseFile(
    def: ExerciseDefinition,
    folder: string
  ): TFile | null {
    if (def.filePath) {
      const byPath = this.app.vault.getFileByPath(normalizePath(def.filePath));
      if (byPath) return byPath;
    }

    const fileName = this.createSafeFileName(def.name, "exercise-note");
    const candidate = this.app.vault.getFileByPath(
      normalizePath(`${folder}/${fileName}.md`)
    );
    if (!candidate) return null;

    const cache = this.app.metadataCache.getFileCache(candidate);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter || frontmatter["wj-type"] !== "exercise") return null;
    return frontmatter["wj-id"] === def.id ? candidate : null;
  }

  /** First unused `name.md`, `name-2.md`, … in the exercise folder. */
  private findFreeExercisePath(name: string, folder: string): string {
    const base = this.createSafeFileName(name, "exercise-note");
    for (let suffix = 1; suffix < 100; suffix++) {
      const candidate = normalizePath(
        `${folder}/${base}${suffix === 1 ? "" : `-${suffix}`}.md`
      );
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    return normalizePath(`${folder}/${base}-${generateId()}.md`);
  }

  async createRoutineDefinition(def: RoutineDefinition): Promise<TFile | null> {
    await this.ensureFolders();
    const fileName = this.createSafeFileName(def.name, "routine-note");
    const folder = this.requireConfiguredFolder(
      this.settings.routinesFolder,
      "Routines folder"
    );
    const path = `${folder}/${fileName}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    const content = this.renderRoutineDefinition(def);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    return this.app.vault.create(path, content);
  }

  async createWorkoutPlanDefinition(
    def: WorkoutPlanDefinition
  ): Promise<TFile | null> {
    await this.ensureFolders();
    const content = this.renderPlanDefinition(def);
    if (def.filePath) {
      const existingByPath = this.app.vault.getAbstractFileByPath(def.filePath);
      if (existingByPath instanceof TFile) {
        await this.app.vault.modify(existingByPath, content);
        return existingByPath;
      }
    }
    const fileName = this.createSafeFileName(def.name, "plan-note");
    const folder = this.requireConfiguredFolder(
      this.settings.workoutPlansFolder,
      "Workout plans folder"
    );
    const path = `${folder}/${fileName}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    return this.app.vault.create(path, content);
  }

  async loadExerciseDefinitions(): Promise<ExerciseDefinition[]> {
    const files = this.getFilesInFolder(this.settings.exerciseLibraryFolder);
    const defs: ExerciseDefinition[] = [];
    for (const file of files) {
      const def = await this.loadExerciseFromFile(file);
      if (def) defs.push(def);
    }
    return defs;
  }

  async loadRoutineDefinitions(): Promise<RoutineDefinition[]> {
    const files = this.getFilesInFolder(this.settings.routinesFolder);
    const defs: RoutineDefinition[] = [];
    for (const file of files) {
      const def = await this.loadRoutineFromFile(file);
      if (def) defs.push(def);
    }
    return defs;
  }

  async loadPlanDefinitions(): Promise<WorkoutPlanDefinition[]> {
    const files = this.getFilesInFolder(this.settings.workoutPlansFolder);
    const defs: WorkoutPlanDefinition[] = [];
    for (const file of files) {
      const def = await this.loadPlanFromFile(file);
      if (def) defs.push(def);
    }
    return defs;
  }

  async loadExerciseFromFile(file: TFile): Promise<ExerciseDefinition | null> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter || frontmatter['wj-type'] !== "exercise") {
        return null;
      }
      const id = this.asString(frontmatter['wj-id']) || file.basename;
      const name = this.asString(frontmatter['wj-name']) || file.basename;
      const type = this.asExerciseType(frontmatter['wj-exercise-type']) || "strength";

      // The body is the source of truth for both prose sections. `wj-notes` is
      // still read as a fallback so notes written before the ## Notes layout
      // existed keep showing up, and still written so Dataview queries against
      // it keep working.
      const sections = parseExerciseNote(content);
      const notes = sections.hasNotes
        ? sections.notes || undefined
        : sections.notes || this.asString(frontmatter['wj-notes']);

      return {
        id,
        name,
        type,
        muscleGroups: this.asStringArray(frontmatter['wj-muscle-groups']),
        notes,
        description: sections.description || undefined,
        equipment: this.asString(frontmatter['wj-equipment']),
        sourceId: this.asString(frontmatter['wj-source-id']),
        source: this.asString(frontmatter['wj-source']),
        catalogName: this.asString(frontmatter['wj-catalog-name']),
        mediaId: this.asString(frontmatter['wj-media-id']),
        mediaMode: isImageMode(frontmatter['wj-media-mode'])
          ? frontmatter['wj-media-mode']
          : undefined,
        defaultSets: this.asNumber(frontmatter['wj-default-sets']),
        defaultReps: this.asNumber(frontmatter['wj-default-reps']),
        defaultWeight: this.asNumber(frontmatter['wj-default-weight']),
        lastPerformedReps: this.asNumber(frontmatter['wj-last-performed-reps']),
        lastPerformedWeight: this.asNumber(frontmatter['wj-last-performed-weight']),
        defaultDuration: this.asNumber(frontmatter['wj-default-duration']),
        defaultDistance: this.asNumber(frontmatter['wj-default-distance']),
        filePath: file.path,
      };
    } catch (error) {
      console.error(`Error parsing exercise definition ${file.path}`, error);
      return null;
    }
  }

  async loadRoutineFromFile(file: TFile): Promise<RoutineDefinition | null> {
    try {
      const frontmatter = await this.readFrontmatter(file);
      if (!frontmatter || frontmatter['wj-type'] !== "routine") {
        return null;
      }
      const id = this.asString(frontmatter['wj-id']) || file.basename;
      const name = this.asString(frontmatter['wj-name']) || file.basename;
      return {
        id,
        name,
        exercises: (frontmatter['wj-exercises'] || []) as RoutineExerciseEntry[],
        estimatedDuration: this.asNumber(frontmatter['wj-estimated-duration']),
        notes: this.asString(frontmatter['wj-notes']),
        planTags: this.asStringArray(frontmatter['wj-plan-tags']),
        filePath: file.path,
        isCircle: frontmatter['wj-circle'] === true,
      };
    } catch (error) {
      console.error(`Error parsing routine definition ${file.path}`, error);
      return null;
    }
  }

  async loadPlanFromFile(file: TFile): Promise<WorkoutPlanDefinition | null> {
    try {
      const frontmatter = await this.readFrontmatter(file);
      if (!frontmatter || frontmatter['wj-type'] !== "plan") {
        return null;
      }
      const id = this.asString(frontmatter['wj-id']) || file.basename;
      const name = this.asString(frontmatter['wj-name']) || file.basename;
      return {
        id,
        name,
        routines: (frontmatter['wj-routines'] || []) as WorkoutPlanRoutineEntry[],
        notes: this.asString(frontmatter['wj-notes']),
        filePath: file.path,
      };
    } catch (error) {
      console.error(`Error parsing plan definition ${file.path}`, error);
      return null;
    }
  }

  async loadRoutineById(id: string): Promise<RoutineDefinition | null> {
    const routines = await this.loadRoutineDefinitions();
    return routines.find((routine) => routine.id === id) || null;
  }

  async loadPlanById(id: string): Promise<WorkoutPlanDefinition | null> {
    const plans = await this.loadPlanDefinitions();
    return plans.find((plan) => plan.id === id) || null;
  }

  async resolveRoutineExercises(
    routine: RoutineDefinition
  ): Promise<{ resolved: RoutineDefinition; warnings: string[] }> {
    const exerciseDefinitions = await this.loadExerciseDefinitions();
    const byId = new Map(exerciseDefinitions.map((exercise) => [exercise.id, exercise]));
    const byName = new Map(
      exerciseDefinitions.map((exercise) => [exercise.name, exercise])
    );
    const warnings: string[] = [];

    const resolvedExercises = routine.exercises.map((entry) => {
      const exercise =
        byId.get(entry.exerciseId) ||
        byName.get(entry.exerciseName) ||
        this.findExerciseByLink(entry.exerciseLink, exerciseDefinitions);
      if (!exercise) {
        warnings.push(
          `Routine "${routine.name}" contains missing exercise "${entry.exerciseName}".`
        );
      }
      return {
        ...entry,
        exerciseId: exercise?.id || entry.exerciseId,
        exerciseName: exercise?.name || entry.exerciseName,
        exerciseLink: exercise?.filePath
          ? `[[${exercise.filePath.replace(/\.md$/, "")}]]`
          : entry.exerciseLink,
      };
    });

    return {
      resolved: {
        ...routine,
        exercises: resolvedExercises,
      },
      warnings,
    };
  }

  async updateRoutineDefinition(def: RoutineDefinition): Promise<boolean> {
    if (!def.filePath) {
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(def.filePath);
    if (!(file instanceof TFile)) {
      return false;
    }

    const content = this.renderRoutineDefinition(def);
    await this.app.vault.modify(file, content);
    return true;
  }

  async validateDefinitions(): Promise<string[]> {
    const warnings: string[] = [];
    const exercises = await this.loadExerciseDefinitions();
    const routines = await this.loadRoutineDefinitions();
    const plans = await this.loadPlanDefinitions();

    const seenExerciseIds = new Set<string>();
    for (const exercise of exercises) {
      if (seenExerciseIds.has(exercise.id)) {
        warnings.push(`Duplicate exercise id: ${exercise.id}`);
      }
      seenExerciseIds.add(exercise.id);
    }

    const exerciseTypeById = new Map(exercises.map((exercise) => [exercise.id, exercise.type]));
    for (const routine of routines) {
      const resolved = await this.resolveRoutineExercises(routine);
      warnings.push(...resolved.warnings);
      if (!routine.exercises.length) {
        warnings.push(`Routine "${routine.name}" has no exercises.`);
      }
      if (routine.isCircle) {
        const invalid = resolved.resolved.exercises.filter(
          (entry) => exerciseTypeById.get(entry.exerciseId) !== "duration-only"
        );
        for (const entry of invalid) {
          warnings.push(
            `Circuit routine "${routine.name}" contains "${entry.exerciseName}", which is not a duration-only exercise.`
          );
        }
      }
    }

    const routineIds = new Set(routines.map((routine) => routine.id));
    for (const plan of plans) {
      for (const routine of plan.routines) {
        if (!routineIds.has(routine.routineId)) {
          warnings.push(
            `Plan "${plan.name}" references missing routine "${routine.routineName}".`
          );
        }
      }
    }

    return warnings;
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = this.normalizeUserPath(path);
    if (!normalized) return;
    if (!this.app.vault.getAbstractFileByPath(normalized)) {
      try {
        await this.app.vault.createFolder(normalized);
      } catch {
        // Vault cache may have been stale (common on iOS startup); re-check.
        if (!this.app.vault.getAbstractFileByPath(normalized)) {
          throw new Error(`Workout Tracker: failed to create folder "${normalized}"`);
        }
      }
    }
  }

  private getFilesInFolder(path: string): TFile[] {
    const normalized = this.normalizeUserPath(path);
    if (!normalized) return [];
    return this.app.vault
      .getMarkdownFiles()
      .filter(
        (file) =>
          file.path.startsWith(`${normalized}/`) && file.extension === "md"
      );
  }

  private async readFrontmatter(file: TFile): Promise<Record<string, unknown> | null> {
    const content = await this.app.vault.read(file);
    return this.parseFrontmatter(content);
  }

  private parseFrontmatter(content: string): Record<string, unknown> | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return null;
    }
    return parseYaml(frontmatterMatch[1]) as Record<string, unknown> | null;
  }

  /** The `wj-*` keys for an exercise, applied in place by processFrontMatter. */
  private applyExerciseFrontmatter(
    frontmatter: Record<string, unknown>,
    def: ExerciseDefinition
  ): void {
    const values: Record<string, unknown> = {
      'wj-type': "exercise",
      'wj-id': def.id,
      'wj-name': def.name,
      'wj-exercise-type': def.type,
      'wj-muscle-groups': def.muscleGroups,
      'wj-default-sets': def.defaultSets,
      'wj-default-reps': def.defaultReps,
      'wj-default-weight': def.defaultWeight,
      'wj-last-performed-reps': def.lastPerformedReps,
      'wj-last-performed-weight': def.lastPerformedWeight,
      'wj-default-duration': def.defaultDuration,
      'wj-default-distance': def.defaultDistance,
      'wj-notes': def.notes,
      'wj-equipment': def.equipment,
      'wj-source': def.source,
      'wj-source-id': def.sourceId,
      'wj-catalog-name': def.catalogName,
      'wj-media-id': def.mediaId,
      'wj-media-mode': def.mediaMode,
    };

    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        delete frontmatter[key];
      } else {
        frontmatter[key] = value;
      }
    }
  }

  private renderExerciseDefinition(def: ExerciseDefinition): string {
    const baseFrontmatter: Record<string, unknown> = {};
    this.applyExerciseFrontmatter(baseFrontmatter, def);
    const templateFm = parseTemplateFrontmatter(
      this.settings.noteTemplates?.exercise?.frontmatter
    );
    const frontmatter = { ...templateFm, ...baseFrontmatter };
    const body =
      `---\n${stringifyYaml(frontmatter)}---\n\n# ${def.name}\n` +
      renderExerciseBody(def.description ?? "", def.notes ?? "");
    return appendTemplateBody(body, this.settings.noteTemplates?.exercise?.body);
  }

  private renderRoutineDefinition(def: RoutineDefinition): string {
    const baseFrontmatter = {
      'wj-type': "routine",
      'wj-id': def.id,
      'wj-name': def.name,
      'wj-exercises': def.exercises,
      'wj-estimated-duration': def.estimatedDuration,
      'wj-notes': def.notes,
      'wj-plan-tags': def.planTags || [],
      // Omitted entirely for regular routines so existing notes stay untouched.
      'wj-circle': def.isCircle ? true : undefined,
    };
    const templateFm = parseTemplateFrontmatter(
      this.settings.noteTemplates?.routine?.frontmatter
    );
    const frontmatter = { ...templateFm, ...baseFrontmatter };
    let body = `---\n${stringifyYaml(frontmatter)}---\n\n# ${def.name}\n\n`;
    if (def.isCircle) {
      body += `**Circuit routine**\n\n`;
    }
    if (def.estimatedDuration) {
      body += `**Estimated Duration:** ${def.estimatedDuration} min\n\n`;
    }
    if (def.notes) {
      body += `${def.notes}\n\n`;
    }
    body += def.isCircle
      ? this.renderCircuitTable(def.exercises)
      : this.renderRoutineTable(def.exercises);
    return appendTemplateBody(body, this.settings.noteTemplates?.routine?.body);
  }

  private renderPlanDefinition(def: WorkoutPlanDefinition): string {
    const baseFrontmatter = {
      'wj-type': "plan",
      'wj-id': def.id,
      'wj-name': def.name,
      'wj-routines': def.routines,
      'wj-notes': def.notes,
    };
    const templateFm = parseTemplateFrontmatter(
      this.settings.noteTemplates?.plan?.frontmatter
    );
    const frontmatter = { ...templateFm, ...baseFrontmatter };
    let body = `---\n${stringifyYaml(frontmatter)}---\n\n# ${def.name}\n\n`;
    if (def.notes) {
      body += `${def.notes}\n\n`;
    }
    body += this.renderPlanTable(def.routines);
    return appendTemplateBody(body, this.settings.noteTemplates?.plan?.body);
  }

  private renderRoutineTable(exercises: RoutineExerciseEntry[]): string {
    let content = "## Exercises\n\n";
    if (!exercises.length) {
      return content + "*No exercises added yet.*\n";
    }
    const weightUnit = this.settings.weightUnit || "kg";
    const distanceUnit = this.settings.distanceUnit || "km";
    for (const exercise of exercises) {
      // Build heading: use exerciseLink with alias if available, else plain name.
      // The pipe in [[path|Name]] is safe in heading context (not a table cell),
      // so no escaping is needed here.
      const heading = exercise.exerciseLink
        ? exercise.exerciseLink.replace(/\]\]$/, `|${exercise.exerciseName}]]`)
        : exercise.exerciseName;
      content += `### ${heading}\n\n`;
      if (exercise.sets.length > 0) {
        content += `| Set | Reps | Weight (${weightUnit}) | Duration | Distance (${distanceUnit}) | Rest |\n`;
        content += `|-----|------|----------|----------|----------|------|\n`;
        exercise.sets.forEach((set, i) => {
          content += `| ${i + 1} | ${set.reps ?? "-"} | ${set.weight ?? "-"} | ${set.duration ?? "-"} | ${set.distance ?? "-"} | ${set.restTime ?? "-"} |\n`;
        });
      }
      if (exercise.notes) {
        content += `\n**Notes:** ${exercise.notes}\n`;
      }
      content += "\n";
    }
    return content;
  }

  private renderCircuitTable(exercises: RoutineExerciseEntry[]): string {
    let content = "## Circuit\n\n";
    if (!exercises.length) {
      return content + "*No exercises added yet.*\n";
    }
    content += "| # | Exercise | Work (s) | Pause (s) |\n";
    content += "|---|----------|----------|-----------|\n";
    exercises.forEach((exercise, index) => {
      // Escape the alias pipe for table cells: [[path|Name]] → [[path\|Name]]
      const nameCell = exercise.exerciseLink
        ? exercise.exerciseLink.replace(/\]\]$/, `\\|${exercise.exerciseName}]]`)
        : exercise.exerciseName;
      const set = exercise.sets[0] || {};
      content += `| ${index + 1} | ${nameCell} | ${set.duration ?? "-"} | ${set.restTime ?? "-"} |\n`;
    });
    return content + "\n";
  }

  private renderPlanTable(routines: WorkoutPlanRoutineEntry[]): string {
    let content = "## Routines\n\n";
    if (!routines.length) {
      return content + "*No routines added yet.*\n";
    }
    content += "| Routine | Day | Notes |\n";
    content += "|---------|-----|-------|\n";
    for (const routine of routines) {
      // Escape the alias pipe for table cells: [[path|Name]] → [[path\|Name]]
      const nameCell = routine.routineLink
        ? routine.routineLink.replace(/\]\]$/, `\\|${routine.routineName}]]`)
        : routine.routineName;
      const day = routine.day || "-";
      const notes = routine.notes || "-";
      content += `| ${nameCell} | ${day} | ${notes} |\n`;
    }
    return content + "\n";
  }

  private createSafeFileName(name: string, fallbackPrefix: string): string {
    const sanitized = name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "");
    return sanitized.length > 0
      ? sanitized
      : `${fallbackPrefix}-${generateId()}`;
  }

  private findExerciseByLink(
    link: string | undefined,
    exercises: ExerciseDefinition[]
  ): ExerciseDefinition | undefined {
    if (!link) return undefined;
    const normalized = link.replace(/\[\[|\]\]/g, "").replace(/\.md$/, "");
    return exercises.find((exercise) => {
      const byPath = exercise.filePath?.replace(/\.md$/, "");
      return byPath === normalized || exercise.id === normalized || exercise.name === normalized;
    });
  }

  private normalizeUserPath(path: string): string {
    const trimmed = path.trim();
    return trimmed ? normalizePath(trimmed) : "";
  }

  private requireConfiguredFolder(path: string, label: string): string {
    const normalized = this.normalizeUserPath(path);
    if (!normalized) {
      throw new Error(
        `Workout Tracker: ${label} must be configured in Settings > Workout Tracker before creating notes.`
      );
    }
    return normalized;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private asNumber(value: unknown): number | undefined {
    return typeof value === "number" ? value : undefined;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  private asExerciseType(value: unknown): ExerciseType | undefined {
    return typeof value === "string" && EXERCISE_TYPES.includes(value as ExerciseType)
      ? (value as ExerciseType)
      : undefined;
  }
}
