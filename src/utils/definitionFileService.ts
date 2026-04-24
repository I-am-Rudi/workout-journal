import { App, Notice, TFile, parseYaml, stringifyYaml } from "obsidian";
import { generateId } from "./idUtils";
import {
  ExerciseDefinition,
  RoutineDefinition,
  RoutineExerciseEntry,
  WorkoutPlanDefinition,
  WorkoutPlanRoutineEntry,
  WorkoutTrackerSettings,
} from "../types";

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
    const path = `${this.settings.exerciseLibraryFolder}/${fileName}.md`;
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
    const path = `${this.settings.routinesFolder}/${fileName}.md`;
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
    const path = `${this.settings.workoutPlansFolder}/${fileName}.md`;
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
      if (!frontmatter || frontmatter.workoutTrackerType !== "exercise") {
        return null;
      }
      return {
        id: frontmatter.id || file.basename,
        name: frontmatter.name || file.basename,
        type: frontmatter.type || "strength",
        muscleGroups: frontmatter.muscleGroups || [],
        notes: frontmatter.notes,
        defaultSets: frontmatter.defaultSets,
        defaultReps: frontmatter.defaultReps,
        defaultWeight: frontmatter.defaultWeight,
        defaultDuration: frontmatter.defaultDuration,
        defaultDistance: frontmatter.defaultDistance,
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
      if (!frontmatter || frontmatter.workoutTrackerType !== "routine") {
        return null;
      }
      return {
        id: frontmatter.id || file.basename,
        name: frontmatter.name || file.basename,
        exercises: (frontmatter.exercises || []) as RoutineExerciseEntry[],
        estimatedDuration: frontmatter.estimatedDuration,
        notes: frontmatter.notes,
        planTags: frontmatter.planTags || [],
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
      if (!frontmatter || frontmatter.workoutTrackerType !== "plan") {
        return null;
      }
      return {
        id: frontmatter.id || file.basename,
        name: frontmatter.name || file.basename,
        routines: (frontmatter.routines || []) as WorkoutPlanRoutineEntry[],
        notes: frontmatter.notes,
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
    if (!this.app.vault.getAbstractFileByPath(path)) {
      await this.app.vault.createFolder(path);
    }
  }

  private getFilesInFolder(path: string): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${path}/`) && file.extension === "md");
  }

  private async readFrontmatter(file: TFile): Promise<any | null> {
    const content = await this.app.vault.read(file);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return null;
    }
    return parseYaml(frontmatterMatch[1]);
  }

  private renderExerciseDefinition(def: ExerciseDefinition): string {
    const frontmatter = {
      workoutTrackerType: "exercise",
      id: def.id,
      name: def.name,
      type: def.type,
      muscleGroups: def.muscleGroups,
      defaultSets: def.defaultSets,
      defaultReps: def.defaultReps,
      defaultWeight: def.defaultWeight,
      defaultDuration: def.defaultDuration,
      defaultDistance: def.defaultDistance,
      notes: def.notes,
      workoutTracker: true,
    };
    return `---\n${stringifyYaml(frontmatter)}---\n\n# ${def.name}\n\n${
      def.notes || ""
    }\n`;
  }

  private renderRoutineDefinition(def: RoutineDefinition): string {
    const frontmatter = {
      workoutTrackerType: "routine",
      id: def.id,
      name: def.name,
      exercises: def.exercises,
      estimatedDuration: def.estimatedDuration,
      notes: def.notes,
      planTags: def.planTags || [],
      workoutTracker: true,
    };
    return `---\n${stringifyYaml(frontmatter)}---\n\n# ${def.name}\n\n${
      def.notes || ""
    }\n`;
  }

  private renderPlanDefinition(def: WorkoutPlanDefinition): string {
    const frontmatter = {
      workoutTrackerType: "plan",
      id: def.id,
      name: def.name,
      routines: def.routines,
      notes: def.notes,
      workoutTracker: true,
    };
    return `---\n${stringifyYaml(frontmatter)}---\n\n# ${def.name}\n\n${
      def.notes || ""
    }\n`;
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
}
