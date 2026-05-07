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
  RoutineDefinition,
  RoutineExerciseEntry,
  WorkoutPlanDefinition,
  WorkoutPlanRoutineEntry,
  WorkoutTrackerSettings,
} from "../types";
import { parseTemplateFrontmatter, appendTemplateBody } from "./noteTemplateUtils";

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

  async createExerciseDefinition(def: ExerciseDefinition): Promise<TFile | null> {
    await this.ensureFolders();
    const fileName = this.createSafeFileName(def.name, "exercise-note");
    const folder = this.requireConfiguredFolder(
      this.settings.exerciseLibraryFolder,
      "Exercise library folder"
    );
    const path = `${folder}/${fileName}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    const content = this.renderExerciseDefinition(def);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    return this.app.vault.create(path, content);
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
    const fileName = this.createSafeFileName(def.name, "plan-note");
    const folder = this.requireConfiguredFolder(
      this.settings.workoutPlansFolder,
      "Workout plans folder"
    );
    const path = `${folder}/${fileName}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    const content = this.renderPlanDefinition(def);
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
      const frontmatter = await this.readFrontmatter(file);
      if (!frontmatter || frontmatter['wj-type'] !== "exercise") {
        return null;
      }
      return {
        id: this.asString(frontmatter['wj-id']) || file.basename,
        name: this.asString(frontmatter['wj-name']) || file.basename,
        type: this.asExerciseType(frontmatter['wj-exercise-type']) || "strength",
        muscleGroups: this.asStringArray(frontmatter['wj-muscle-groups']),
        notes: this.asString(frontmatter['wj-notes']),
        defaultSets: this.asNumber(frontmatter['wj-default-sets']),
        defaultReps: this.asNumber(frontmatter['wj-default-reps']),
        defaultWeight: this.asNumber(frontmatter['wj-default-weight']),
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
      return {
        id: this.asString(frontmatter['wj-id']) || file.basename,
        name: this.asString(frontmatter['wj-name']) || file.basename,
        exercises: Array.isArray(frontmatter['wj-exercises'])
          ? (frontmatter['wj-exercises'] as RoutineExerciseEntry[])
          : [],
        estimatedDuration: this.asNumber(frontmatter['wj-estimated-duration']),
        notes: this.asString(frontmatter['wj-notes']),
        planTags: this.asStringArray(frontmatter['wj-plan-tags']),
        filePath: file.path,
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
      return {
        id: this.asString(frontmatter['wj-id']) || file.basename,
        name: this.asString(frontmatter['wj-name']) || file.basename,
        routines: Array.isArray(frontmatter['wj-routines'])
          ? (frontmatter['wj-routines'] as WorkoutPlanRoutineEntry[])
          : [],
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

    for (const routine of routines) {
      const resolved = await this.resolveRoutineExercises(routine);
      warnings.push(...resolved.warnings);
      if (!routine.exercises.length) {
        warnings.push(`Routine "${routine.name}" has no exercises.`);
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
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return null;
    }
    const parsed = parseYaml(frontmatterMatch[1]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private asNumber(value: unknown): number | undefined {
    return typeof value === "number" ? value : undefined;
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  }

  private asExerciseType(
    value: unknown
  ): ExerciseDefinition["type"] | undefined {
    return value === "strength" || value === "cardio" ? value : undefined;
  }

  private renderExerciseDefinition(def: ExerciseDefinition): string {
    const baseFrontmatter = {
      'wj-type': "exercise",
      'wj-id': def.id,
      'wj-name': def.name,
      'wj-exercise-type': def.type,
      'wj-muscle-groups': def.muscleGroups,
      'wj-default-sets': def.defaultSets,
      'wj-default-reps': def.defaultReps,
      'wj-default-weight': def.defaultWeight,
      'wj-default-duration': def.defaultDuration,
      'wj-default-distance': def.defaultDistance,
      'wj-notes': def.notes,
    };
    const templateFm = parseTemplateFrontmatter(
      this.settings.noteTemplates?.exercise?.frontmatter
    );
    const frontmatter = { ...templateFm, ...baseFrontmatter };
    const body =
      `---\n${stringifyYaml(frontmatter)}---\n\n# ${def.name}\n\n${def.notes || ""}\n`;
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
    };
    const templateFm = parseTemplateFrontmatter(
      this.settings.noteTemplates?.routine?.frontmatter
    );
    const frontmatter = { ...templateFm, ...baseFrontmatter };
    let body = `---\n${stringifyYaml(frontmatter)}---\n\n# ${def.name}\n\n`;
    if (def.estimatedDuration) {
      body += `**Estimated Duration:** ${def.estimatedDuration} min\n\n`;
    }
    if (def.notes) {
      body += `${def.notes}\n\n`;
    }
    body += this.renderRoutineTable(def.exercises);
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
    for (const exercise of exercises) {
      // Build heading: use exerciseLink with alias if available, else plain name.
      // The pipe in [[path|Name]] is safe in heading context (not a table cell),
      // so no escaping is needed here.
      const heading = exercise.exerciseLink
        ? exercise.exerciseLink.replace(/\]\]$/, `|${exercise.exerciseName}]]`)
        : exercise.exerciseName;
      content += `### ${heading}\n\n`;
      if (exercise.sets.length > 0) {
        content += `| Set | Reps | Weight (${weightUnit}) | Duration | Distance | Rest |\n`;
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
}
