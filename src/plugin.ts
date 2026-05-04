import {
  App,
  Editor,
  EventRef,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import {
  ExerciseDefinition,
  RoutineDefinition,
  SessionFinishOptions,
  Workout,
  WorkoutPlanDefinition,
  WorkoutSession,
  WorkoutTrackerSettings,
} from "./types";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import { WorkoutFileService } from "./utils/workoutFileService";
import { DefinitionFileService } from "./utils/definitionFileService";
import { PerformanceCsvService } from "./utils/performanceCsvService";
import { WorkoutSessionService } from "./utils/workoutSessionService";
import { generateId, createIdFromName } from "./utils/idUtils";
import {
  ExerciseTemplateModal,
  InputPromptModal,
  PlanSelectionModal,
  QuickWorkoutModal,
  RoutineSelectionModal,
  SessionFinishModal,
  WorkoutEditModal,
  WorkoutModal,
  WorkoutStatsModal,
  WorkoutTypeSelectionModal,
} from "./modals";
import { WorkoutTrackerSettingTab } from "./settings";
import {
  WORKOUT_SESSION_VIEW_TYPE,
  WorkoutSessionView,
} from "./views/WorkoutSessionView";

export default class WorkoutTrackerPlugin extends Plugin {
  private static readonly DEFAULT_SINGLE_EXERCISE_SETS = 3;
  private static readonly MIGRATION_DEFAULT_REPS = 8;
  private static readonly MIGRATION_DEFAULT_WEIGHT = 0;
  settings: WorkoutTrackerSettings;
  fileService: WorkoutFileService;
  definitionService: DefinitionFileService;
  performanceCsvService: PerformanceCsvService;
  workoutSessionService: WorkoutSessionService;
  activeSession: WorkoutSession | null = null;
  private sessionLeaf: WorkspaceLeaf | null = null;
  private fileModifyEventRef: EventRef | undefined;
  private syncTimeouts: Map<string, NodeJS.Timeout> = new Map();

  async onload() {
    await this.loadSettings();

    this.fileService = new WorkoutFileService(
      this.app,
      this.settings.defaultWorkoutFolder
    );
    this.definitionService = new DefinitionFileService(this.app, this.settings);
    this.performanceCsvService = new PerformanceCsvService(
      this.app,
      this.settings.performanceCsvPath
    );
    this.workoutSessionService = new WorkoutSessionService(
      this.performanceCsvService
    );

    await this.definitionService.ensureFolders();
    await this.performanceCsvService.ensureFile();

    this.registerView(
      WORKOUT_SESSION_VIEW_TYPE,
      (leaf) => new WorkoutSessionView(leaf, this)
    );

    this.fileModifyEventRef = this.app.vault.on(
      "modify",
      this.handleFileModify.bind(this)
    );
    this.registerEvent(this.fileModifyEventRef);

    const ribbonIconEl = this.addRibbonIcon(
      "biceps-flexed",
      "Workout Journal",
      () => {
        new WorkoutTypeSelectionModal(this.app, this).open();
      }
    );
    ribbonIconEl.addClass("workout-tracker-ribbon-class");

    this.addCommand({
      id: "create-new-workout",
      name: "Create New Workout",
      callback: () => {
        new WorkoutModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "insert-exercise-template",
      name: "Insert Exercise Template",
      editorCallback: (
        editor: Editor,
        context: MarkdownView | MarkdownFileInfo
      ) => {
        if (context instanceof MarkdownView) {
          new ExerciseTemplateModal(this.app, this, editor).open();
        } else {
          new Notice("This command can only be used in a Markdown view.");
        }
      },
    });

    this.addCommand({
      id: "quick-log-workout",
      name: "Quick Log Workout",
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          if (!checking) {
            new QuickWorkoutModal(this.app, this).open();
          }
          return true;
        }
      },
    });

    this.addCommand({
      id: "view-workout-statistics",
      name: "View Workout Statistics",
      callback: () => {
        new WorkoutStatsModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "edit-current-workout",
      name: "Edit Current Workout",
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView && markdownView.file) {
          if (!checking) {
            this.editWorkoutFile(markdownView.file);
          }
          return true;
        }
      },
    });

    this.addCommand({
      id: "start-workout-from-routine",
      name: "Start Workout From Routine",
      callback: async () => {
        const routines = await this.definitionService.loadRoutineDefinitions();
        new RoutineSelectionModal(this.app, routines, async (routine) => {
          await this.startSessionFromRoutine(routine, true);
        }).open();
      },
    });

    this.addCommand({
      id: "start-workout-from-plan",
      name: "Start Workout From Plan",
      callback: async () => {
        const [plans, routines] = await Promise.all([
          this.definitionService.loadPlanDefinitions(),
          this.definitionService.loadRoutineDefinitions(),
        ]);
        new PlanSelectionModal(this.app, plans, routines, async (plan, routine) => {
          await this.startSessionFromRoutine(routine, true, plan);
        }).open();
      },
    });

    this.addCommand({
      id: "start-workout-from-current-note",
      name: "Start Workout From Current Note",
      callback: async () => {
        await this.startWorkoutFromCurrentNote();
      },
    });

    this.addCommand({
      id: "open-workout-session-popout",
      name: "Open Active Workout Session in Popout",
      callback: async () => {
        if (!this.activeSession) {
          new Notice("No active session. Start one from a routine or plan first.");
          return;
        }
        await this.openSessionView(true);
      },
    });

    this.addCommand({
      id: "create-exercise-note",
      name: "Create Exercise Note",
      callback: async () => {
        await this.createExerciseNoteFromPrompt();
      },
    });

    this.addCommand({
      id: "create-routine-note",
      name: "Create Routine Note",
      callback: async () => {
        await this.createRoutineNoteFromPrompt();
      },
    });

    this.addCommand({
      id: "create-workout-plan-note",
      name: "Create Workout Plan Note",
      callback: async () => {
        await this.createPlanNoteFromPrompt();
      },
    });

    this.addCommand({
      id: "migrate-settings-templates-to-notes",
      name: "Migrate Settings Templates to Notes",
      callback: async () => {
        await this.migrateTemplatesToNotes();
      },
    });

    this.addSettingTab(new WorkoutTrackerSettingTab(this.app, this));
  }

  onunload() {
    if (this.fileModifyEventRef) {
      this.app.vault.offref(this.fileModifyEventRef);
    }
    this.syncTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.syncTimeouts.clear();
    this.app.workspace.detachLeavesOfType(WORKOUT_SESSION_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.migration) {
      this.settings.migration = {
        completed: false,
        exerciseCount: 0,
        routineCount: 0,
      };
    }

    if (this.fileService) {
      this.fileService = new WorkoutFileService(
        this.app,
        this.settings.defaultWorkoutFolder
      );
    }
    if (this.definitionService) {
      this.definitionService.setSettings(this.settings);
    }
    if (this.performanceCsvService) {
      this.performanceCsvService.setPath(this.settings.performanceCsvPath);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async createWorkoutFile(workout: Workout): Promise<void> {
    try {
      await this.fileService.saveWorkout(workout);
    } catch (error) {
      new Notice(`Error creating workout file: ${error.message}`);
    }
  }

  async editWorkoutFile(file: TFile): Promise<void> {
    try {
      const workout = await this.fileService.loadWorkout(file);
      if (workout) {
        new WorkoutEditModal(this.app, this, file, workout).open();
      } else {
        new Notice("This file does not contain valid workout data");
      }
    } catch (error) {
      new Notice(`Error loading workout file: ${error.message}`);
    }
  }

  async startSessionFromRoutine(
    routine: RoutineDefinition,
    preferPopout: boolean,
    plan?: WorkoutPlanDefinition
  ): Promise<void> {
    const resolved = await this.definitionService.resolveRoutineExercises(routine);
    if (resolved.warnings.length) {
      new Notice(resolved.warnings.join("\n"));
    }
    const exerciseDefs = await this.definitionService.loadExerciseDefinitions();
    const exerciseNotesMap = new Map(
      exerciseDefs
        .filter((def) => def.notes)
        .map((def) => [def.id, def.notes!])
    );
    const session = await this.workoutSessionService.createSessionFromRoutine(
      resolved.resolved,
      {
        planId: plan?.id,
        planName: plan?.name,
        exerciseNotesMap,
      }
    );
    this.activeSession = session;
    await this.openSessionView(preferPopout);
  }

  async finishActiveSessionFromView(): Promise<void> {
    const hasUnfinishedSets =
      this.activeSession?.exercises.some((exercise) =>
        exercise.sets.some((set) => !set.completed)
      ) || false;

    new SessionFinishModal(this.app, hasUnfinishedSets, async (options) => {
      await this.finishActiveSession(options);
    }).open();
  }

  async finishActiveSession(options: SessionFinishOptions): Promise<void> {
    if (!this.activeSession) {
      new Notice("No active session to finish.");
      return;
    }

    let sessionToSave = this.activeSession;
    if (options.fillUncompletedSets) {
      sessionToSave = this.workoutSessionService.fillUncompletedSets(sessionToSave);
    }
    if (options.storeNewTargets) {
      sessionToSave = this.workoutSessionService.applyTargetUpdates(sessionToSave);
    }

    const workout = this.workoutSessionService.toWorkoutLog(sessionToSave);
    await this.createWorkoutFile(workout);
    await this.performanceCsvService.appendSession(sessionToSave);
    if (options.storeNewTargets) {
      await this.performanceCsvService.appendTargetUpdate(sessionToSave);
    }

    if (
      sessionToSave.routineId &&
      (options.routineChangeStrategy !== "ignore" || options.storeNewTargets)
    ) {
      const routine = await this.definitionService.loadRoutineById(sessionToSave.routineId);
      if (routine) {
        const merged = this.workoutSessionService.mergeSessionIntoRoutine(
          routine,
          sessionToSave,
          options
        );
        if (options.routineChangeStrategy === "overwrite") {
          await this.definitionService.updateRoutineDefinition(merged);
        } else if (options.routineChangeStrategy === "create_new") {
          const nextRoutine: RoutineDefinition = {
            ...merged,
            id: `${merged.id}-${sessionToSave.id}`,
            name: `${merged.name} (updated ${sessionToSave.date})`,
            filePath: undefined,
          };
          await this.definitionService.createRoutineDefinition(nextRoutine);
        }
      }
    }

    this.activeSession = null;
    if (this.sessionLeaf) {
      await this.sessionLeaf.setViewState({ type: "empty" });
      this.sessionLeaf = null;
    }
    new Notice("Workout finished and saved.");
  }

  async startWorkoutFromCurrentNote(): Promise<void> {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView?.file) {
      new Notice("Open a routine or plan note first.");
      return;
    }

    const file = markdownView.file;
    const routine = await this.definitionService.loadRoutineFromFile(file);
    if (routine) {
      await this.startSessionFromRoutine(routine, true);
      return;
    }

    const plan = await this.definitionService.loadPlanFromFile(file);
    if (plan) {
      const routines = await this.definitionService.loadRoutineDefinitions();
      new PlanSelectionModal(this.app, [plan], routines, async (selectedPlan, selectedRoutine) => {
        await this.startSessionFromRoutine(selectedRoutine, true, selectedPlan);
      }).open();
      return;
    }

    const exercise = await this.definitionService.loadExerciseFromFile(file);
    if (exercise) {
      const routineDef: RoutineDefinition = {
        id: `single-${exercise.id}`,
        name: exercise.name,
        exercises: [
          {
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            sets: Array.from({
              length:
                exercise.defaultSets ||
                WorkoutTrackerPlugin.DEFAULT_SINGLE_EXERCISE_SETS,
            }).map(() => ({
              reps: exercise.defaultReps,
              weight: exercise.defaultWeight,
              duration: exercise.defaultDuration,
              distance: exercise.defaultDistance,
            })),
          },
        ],
      };
      await this.startSessionFromRoutine(routineDef, true);
      return;
    }

    new Notice("Current note is not a workout exercise, routine, or plan note.");
  }

  async migrateTemplatesToNotes(): Promise<void> {
    await this.definitionService.ensureFolders();

    let migratedExercises = 0;
    let migratedRoutines = 0;

    for (const template of this.settings.exerciseTemplates) {
      const def: ExerciseDefinition = {
        id: this.createIdFromName(template.name),
        name: template.name,
        type: template.type,
        muscleGroups: template.muscleGroups,
        defaultSets: template.defaultSets,
        defaultReps: template.defaultReps,
        defaultWeight: template.defaultWeight,
        defaultDuration: template.defaultDuration,
      };
      await this.definitionService.createExerciseDefinition(def);
      migratedExercises++;
    }

    for (const template of this.settings.workoutTemplates) {
      const routine: RoutineDefinition = {
        id: this.createIdFromName(template.name),
        name: template.name,
        estimatedDuration: template.estimatedDuration,
        exercises: template.exercises.map((exerciseName) => ({
          exerciseId: this.createIdFromName(exerciseName),
          exerciseName,
          exerciseLink: `[[${this.settings.exerciseLibraryFolder}/${exerciseName}]]`,
          sets: [
            {
              reps: WorkoutTrackerPlugin.MIGRATION_DEFAULT_REPS,
              weight: WorkoutTrackerPlugin.MIGRATION_DEFAULT_WEIGHT,
            },
          ],
        })),
      };
      await this.definitionService.createRoutineDefinition(routine);
      migratedRoutines++;
    }

    this.settings.migration = {
      completed: true,
      migratedAt: new Date().toISOString(),
      exerciseCount: migratedExercises,
      routineCount: migratedRoutines,
    };
    await this.saveSettings();
    new Notice(
      `Migration complete. Created ${migratedExercises} exercise notes and ${migratedRoutines} routine notes.`
    );
  }

  private async openSessionView(preferPopout: boolean): Promise<void> {
    let leaf: WorkspaceLeaf | null = null;
    if (preferPopout) {
      try {
        leaf = this.app.workspace.getLeaf("window");
      } catch (error) {
        console.debug("Workout Tracker: popout unavailable, using fallback leaf.", error);
        leaf = null;
      }
    }
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
    }

    this.sessionLeaf = leaf;
    await leaf.setViewState({
      type: WORKOUT_SESSION_VIEW_TYPE,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (view instanceof WorkoutSessionView && this.activeSession) {
      view.setSession(this.activeSession);
    }
  }

  private async createExerciseNoteFromPrompt(): Promise<void> {
    const name = await this.prompt("Exercise name");
    if (!name) return;
    const definition: ExerciseDefinition = {
      id: this.createIdFromName(name),
      name,
      type: "strength",
      muscleGroups: [],
      defaultSets: 3,
      defaultReps: 8,
    };
    await this.definitionService.createExerciseDefinition(definition);
    new Notice(`Exercise note created: ${name}`);
  }

  private async createRoutineNoteFromPrompt(): Promise<void> {
    const name = await this.prompt("Routine name");
    if (!name) return;
    const routine: RoutineDefinition = {
      id: this.createIdFromName(name),
      name,
      exercises: [],
      estimatedDuration: 60,
    };
    await this.definitionService.createRoutineDefinition(routine);
    new Notice(`Routine note created: ${name}`);
  }

  private async createPlanNoteFromPrompt(): Promise<void> {
    const name = await this.prompt("Workout plan name");
    if (!name) return;
    const plan: WorkoutPlanDefinition = {
      id: this.createIdFromName(name),
      name,
      routines: [],
    };
    await this.definitionService.createWorkoutPlanDefinition(plan);
    new Notice(`Workout plan note created: ${name}`);
  }

  private prompt(label: string): Promise<string | null> {
    return new Promise((resolve) => {
      new InputPromptModal(this.app, label, "Enter value", (value) => {
        resolve(value);
      }).open();
    });
  }

  private createIdFromName(name: string): string {
    return createIdFromName(name);
  }

  private handleFileModify(file: TFile): void {
    if (!this.settings.enableAutoSyncFrontmatter) {
      return;
    }
    if (file.extension !== "md") {
      return;
    }

    const existingTimeout = this.syncTimeouts.get(file.path);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        const isWorkout = await this.fileService.isWorkoutFile(file);
        if (!isWorkout) {
          return;
        }
        const wasUpdated = await this.fileService.syncFrontmatterWithContent(file);
        if (wasUpdated) {
          console.log(`Auto-synced frontmatter for: ${file.path}`);
        }
      } catch (error) {
        console.error(`Error syncing frontmatter for ${file.path}:`, error);
      } finally {
        this.syncTimeouts.delete(file.path);
      }
    }, this.settings.autoSyncDelayMs);

    this.syncTimeouts.set(file.path, timeout);
  }
}
