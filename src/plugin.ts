import {
  Editor,
  EventRef,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  Platform,
  Plugin,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import {
  ExerciseDefinition,
  RoutineDefinition,
  SessionFinishOptions,
  Workout,
  WorkoutPlanDefinition,
  WorkoutSession,
  WorkoutSessionSet,
  WorkoutTrackerSettings,
} from "./types";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import { WorkoutFileService } from "./utils/workoutFileService";
import { DefinitionFileService } from "./utils/definitionFileService";
import { PerformanceCsvService } from "./utils/performanceCsvService";
import { WorkoutSessionService } from "./utils/workoutSessionService";
import { CatalogService } from "./utils/catalogService";
import { CatalogMatcher } from "./utils/catalogMatcher";
import { CatalogImportService } from "./utils/catalogImportService";
import { ExerciseMediaService } from "./utils/exerciseMediaService";
import { CatalogPickerModal } from "./modals/CatalogPickerModal";
import { CatalogBrowseModal } from "./modals/CatalogBrowseModal";
import { ConfirmChoiceModal } from "./modals/ConfirmChoiceModal";
import { createIdFromName, generateId } from "./utils/idUtils";
import {
  absorbOfflineGap,
  getSessionDurationMinutes,
} from "./utils/sessionTimerUtils";
import {
  DEFAULT_CIRCUIT_REST_SECONDS,
  DEFAULT_CIRCUIT_WORK_SECONDS,
} from "./utils/exerciseTypeUtils";
import {
  CircuitStartModal,
  CircuitSummaryModal,
  ExerciseDefinitionModal,
  ExerciseTemplateModal,
  InputPromptModal,
  PlanSelectionModal,
  QuickWorkoutModal,
  RoutineSelectionModal,
  SessionFinishModal,
  StrongImportModal,
  WorkoutEditModal,
  WorkoutModal,
  WorkoutHomeModal,
  WorkoutStatsModal,
} from "./modals";
import { CircuitFinishResult } from "./modals/CircuitSummaryModal";
import {
  PlanBuilderModal,
  RoutineBuilderModal,
  WorkoutTrackerSettingTab,
} from "./settings";
import {
  WORKOUT_SESSION_VIEW_TYPE,
  WorkoutSessionView,
} from "./views/WorkoutSessionView";
import {
  CIRCUIT_SESSION_VIEW_TYPE,
  CircuitSessionView,
} from "./views/CircuitSessionView";

export default class WorkoutTrackerPlugin extends Plugin {
  private static readonly DEFAULT_SINGLE_EXERCISE_SETS = 3;
  private static readonly MIGRATION_DEFAULT_REPS = 8;
  private static readonly MIGRATION_DEFAULT_WEIGHT = 0;
  /** How often the in-memory session is snapshotted to disk (catches in-place edits). */
  private static readonly SESSION_AUTOSAVE_INTERVAL_MS = 5000;
  private static readonly SESSION_STATE_FILE = "active-session.json";
  /** A restored session older than this is not auto-reopened on startup. */
  private static readonly SESSION_AUTO_REOPEN_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  settings: WorkoutTrackerSettings;
  fileService: WorkoutFileService;
  definitionService: DefinitionFileService;
  performanceCsvService: PerformanceCsvService;
  workoutSessionService: WorkoutSessionService;
  catalogService: CatalogService;
  catalogImportService: CatalogImportService;
  mediaService: ExerciseMediaService;
  /** Built on first use — decoding the index costs nothing until then. */
  private catalogMatcherInstance: CatalogMatcher | null = null;
  activeSession: WorkoutSession | null = null;
  private sessionLeaf: WorkspaceLeaf | null = null;
  private fileModifyEventRef: EventRef | undefined;
  private syncTimeouts: Map<string, number> = new Map();
  private lastPersistedSessionJson: string | null = null;
  private sessionWriteQueue: Promise<void> = Promise.resolve();
  private restoredSessionSavedAt: number | null = null;

  async onload() {
    await this.loadSettings();
    await this.restorePersistedSession();

    this.fileService = new WorkoutFileService(
      this.app,
      this.settings.defaultWorkoutFolder,
      this.settings
    );
    this.definitionService = new DefinitionFileService(this.app, this.settings);
    this.performanceCsvService = new PerformanceCsvService(
      this.app,
      this.settings.performanceCsvPath
    );
    this.workoutSessionService = new WorkoutSessionService(
      this.performanceCsvService
    );
    this.catalogService = new CatalogService();
    this.mediaService = new ExerciseMediaService(this.app);
    this.catalogImportService = new CatalogImportService(
      this.app,
      this.catalogService,
      this.definitionService,
      this.mediaService,
      this.settings
    );

    this.registerView(
      WORKOUT_SESSION_VIEW_TYPE,
      (leaf) => new WorkoutSessionView(leaf, this)
    );
    this.registerView(
      CIRCUIT_SESSION_VIEW_TYPE,
      (leaf) => new CircuitSessionView(leaf, this)
    );

    this.fileModifyEventRef = this.app.vault.on(
      "modify",
      (file: TFile) => this.handleFileModify(file)
    );
    this.registerEvent(this.fileModifyEventRef);

    const openWorkoutTypeModal = () => {
      new WorkoutHomeModal(this.app, this).open();
    };
    let ribbonIcon: ReturnType<typeof this.addRibbonIcon> | null = null;
    try {
      ribbonIcon = this.addRibbonIcon(
        "biceps-flexed",
        "Workout Journal",
        openWorkoutTypeModal
      );
    } catch (error) {
      console.warn(
        "Workout Journal: icon 'biceps-flexed' unavailable, falling back to 'calendar'.",
        error
      );
      try {
        ribbonIcon = this.addRibbonIcon(
          "calendar",
          "Workout Journal",
          openWorkoutTypeModal
        );
      } catch (fallbackError) {
        console.error(
          "Workout Journal: unable to register ribbon icon; continuing without ribbon icon.",
          fallbackError
        );
      }
    }
    if (ribbonIcon) {
      ribbonIcon.addClass("workout-tracker-ribbon-class");
    }

    // The session is mutated in place by the session view, so snapshot it
    // periodically and whenever the app is about to be backgrounded. On iOS the
    // OS can terminate a backgrounded Obsidian without any further JS running.
    this.registerInterval(
      window.setInterval(
        () => this.persistActiveSession(),
        WorkoutTrackerPlugin.SESSION_AUTOSAVE_INTERVAL_MS
      )
    );
    this.registerDomEvent(activeDocument, "visibilitychange", () => {
      if (activeDocument.visibilityState === "hidden") {
        this.persistActiveSession();
      }
    });
    this.registerDomEvent(window, "blur", () => this.persistActiveSession());
    this.registerDomEvent(window, "pagehide", () => this.persistActiveSession());

    this.app.workspace.onLayoutReady(async () => {
      await this.attachRestoredSessionToViews();
      await this.definitionService.ensureFolders();
      await this.performanceCsvService.ensureFile();
    });

    this.addCommand({
      id: "create-new-workout",
      name: "Create new workout",
      callback: () => {
        new WorkoutModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "insert-exercise-template",
      name: "Insert exercise template",
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
      name: "Quick log workout",
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
      name: "View workout statistics",
      callback: () => {
        new WorkoutStatsModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "edit-current-workout",
      name: "Edit current workout",
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView && markdownView.file) {
          if (!checking) {
            void this.editWorkoutFile(markdownView.file);
          }
          return true;
        }
      },
    });

    this.addCommand({
      id: "start-workout-from-routine",
      name: "Start workout from routine",
      callback: async () => {
        const routines = await this.definitionService.loadRoutineDefinitions();
        new RoutineSelectionModal(this.app, routines, (routine) => {
          void this.startSessionFromRoutine(routine, true);
        }).open();
      },
    });

    this.addCommand({
      id: "start-workout-from-plan",
      name: "Start workout from plan",
      callback: async () => {
        const [plans, routines] = await Promise.all([
          this.definitionService.loadPlanDefinitions(),
          this.definitionService.loadRoutineDefinitions(),
        ]);
        new PlanSelectionModal(this.app, plans, routines, (plan, routine) => {
          void this.startSessionFromRoutine(routine, true, plan);
        }).open();
      },
    });

    this.addCommand({
      id: "start-workout-from-current-note",
      name: "Start workout from current note",
      callback: async () => {
        await this.startWorkoutFromCurrentNote();
      },
    });

    this.addCommand({
      id: "open-workout-session-popout",
      name: "Open active workout session in popout",
      callback: async () => {
        await this.openActiveSessionView(true);
      },
    });

    this.addCommand({
      id: "create-exercise-note",
      name: "Create exercise note",
      callback: async () => {
        await this.createExerciseNoteFromPrompt();
      },
    });

    this.addCommand({
      id: "create-routine-note",
      name: "Create routine note",
      callback: async () => {
        await this.createRoutineNoteFromPrompt();
      },
    });

    this.addCommand({
      id: "create-circuit-routine-note",
      name: "Create circuit routine note",
      callback: async () => {
        await this.createRoutineNoteFromPrompt(true);
      },
    });

    this.addCommand({
      id: "edit-current-note-as-routine",
      name: "Edit current note as routine",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.openRoutineEditor(file);
        return true;
      },
    });

    this.addCommand({
      id: "edit-current-note-as-exercise",
      name: "Edit current note as exercise",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.openExerciseEditor(file);
        return true;
      },
    });

    this.addCommand({
      id: "edit-current-note-as-plan",
      name: "Edit current note as workout plan",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.openPlanEditor(file);
        return true;
      },
    });

    this.addCommand({
      id: "create-workout-plan-note",
      name: "Create workout plan note",
      callback: async () => {
        await this.createPlanNoteFromPrompt();
      },
    });

    this.addCommand({
      id: "create-routine-from-workout",
      name: "Create routine from current workout",
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView && markdownView.file) {
          if (!checking) {
            void this.createRoutineFromWorkoutFile(markdownView.file);
          }
          return true;
        }
      },
    });

    this.addCommand({
      id: "import-from-strong",
      name: "Import from strong app",
      callback: () => new StrongImportModal(this.app, this).open(),
    });

    this.addCommand({
      id: "browse-exercise-catalog",
      name: "Browse the exercise catalog",
      callback: () => {
        new CatalogBrowseModal(this.app, this, () => undefined).open();
      },
    });

    this.addCommand({
      id: "attach-catalog-description",
      name: "Attach description from the exercise catalog",
      // Depends on the active note actually being an exercise note, so it stays
      // out of the palette everywhere else.
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (frontmatter?.["wj-type"] !== "exercise") return false;
        if (!checking) void this.attachCatalogDescription(file);
        return true;
      },
    });

    this.addCommand({
      id: "add-example-templates",
      name: "Add example exercise and routine notes",
      callback: async () => {
        await this.addExampleTemplates();
      },
    });

    this.addSettingTab(new WorkoutTrackerSettingTab(this.app, this));
  }

  onunload() {
    this.persistActiveSession();
    if (this.fileModifyEventRef) {
      this.app.vault.offref(this.fileModifyEventRef);
    }
    this.syncTimeouts.forEach((timeout) => window.clearTimeout(timeout));
    this.syncTimeouts.clear();
  }

  /** Path of the crash-recovery snapshot inside the plugin's own config folder. */
  private getSessionStatePath(): string {
    const pluginDir =
      this.manifest.dir ??
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return normalizePath(
      `${pluginDir}/${WorkoutTrackerPlugin.SESSION_STATE_FILE}`
    );
  }

  /**
   * Replaces the active session and immediately writes the change to disk so a
   * start/finish/cancel is never lost, even if the app dies right afterwards.
   */
  setActiveSession(session: WorkoutSession | null): void {
    this.activeSession = session;
    this.persistActiveSession();
  }

  /**
   * Writes the current session to disk if it changed since the last write.
   * Cheap enough to call on every render; writes are queued so they can never
   * interleave into a half-written file.
   */
  persistActiveSession(): void {
    const snapshot = this.activeSession
      ? JSON.stringify(this.activeSession)
      : null;
    if (snapshot === this.lastPersistedSessionJson) {
      return;
    }
    this.lastPersistedSessionJson = snapshot;

    const path = this.getSessionStatePath();
    const payload =
      snapshot === null
        ? null
        : JSON.stringify({
            version: 1,
            savedAt: new Date().toISOString(),
            session: this.activeSession,
          });

    this.sessionWriteQueue = this.sessionWriteQueue
      .then(async () => {
        const adapter = this.app.vault.adapter;
        if (payload === null) {
          if (await adapter.exists(path)) {
            await adapter.remove(path);
          }
          return;
        }
        await adapter.write(path, payload);
      })
      .catch((error) => {
        console.error("Workout Journal: could not persist active session.", error);
        // Force a retry on the next autosave tick.
        this.lastPersistedSessionJson = null;
      });
  }

  /** Reads back a session left behind by a crash, a force-quit, or an iOS kill. */
  private async restorePersistedSession(): Promise<void> {
    const path = this.getSessionStatePath();
    try {
      if (!(await this.app.vault.adapter.exists(path))) {
        return;
      }
      const raw = await this.app.vault.adapter.read(path);
      const parsed = JSON.parse(raw) as Record<string, unknown> | null;
      const session = parsed?.session as WorkoutSession | undefined;
      if (
        !session ||
        typeof session.id !== "string" ||
        !Array.isArray(session.exercises)
      ) {
        return;
      }
      const savedAt = Date.parse(String(parsed?.savedAt ?? ""));
      this.restoredSessionSavedAt = Number.isNaN(savedAt) ? null : savedAt;
      // The workout clock must not count the hours Obsidian was closed.
      absorbOfflineGap(session, this.restoredSessionSavedAt);
      this.activeSession = session;
      this.lastPersistedSessionJson = JSON.stringify(session);
    } catch (error) {
      console.error(
        "Workout Journal: could not restore the previous workout session.",
        error
      );
    }
  }

  /**
   * Pushes a restored session into session views that the workspace reopened
   * before (or without) `openSessionView()` running.
   */
  private async attachRestoredSessionToViews(): Promise<void> {
    const session = this.activeSession;
    if (!session) return;

    const leaves = this.app.workspace.getLeavesOfType(this.viewTypeForSession(session));
    for (const leaf of leaves) {
      this.sessionLeaf = leaf;
      const view = leaf.view;
      if (view instanceof WorkoutSessionView && !view.session) {
        view.setSession(session);
      } else if (view instanceof CircuitSessionView && !view.session) {
        view.setSession(session);
      }
    }
    if (leaves.length) return;

    // The workspace did not restore a session panel (typical after an iOS kill).
    // Reopen it for a session that was still being worked on; for an older
    // leftover just mention it, so a forgotten session can't hijack every start.
    const age =
      this.restoredSessionSavedAt === null
        ? Number.POSITIVE_INFINITY
        : Date.now() - this.restoredSessionSavedAt;
    if (age <= WorkoutTrackerPlugin.SESSION_AUTO_REOPEN_MAX_AGE_MS) {
      await this.openSessionView(false);
      new Notice(`Restored unfinished workout session "${session.name}".`);
    } else {
      new Notice(
        `Unfinished workout session "${session.name}" restored. Resume it from the Workout Journal ribbon icon.`
      );
    }
  }

  /**
   * Circuit sessions get the guided player; editing a circuit routine still
   * uses the regular session view, which doubles as the routine editor.
   */
  private viewTypeForSession(session: WorkoutSession): string {
    return session.isCircle && !session.routineEditMode
      ? CIRCUIT_SESSION_VIEW_TYPE
      : WORKOUT_SESSION_VIEW_TYPE;
  }

  /** Reveals the panel for the active session, reusing an already open one. */
  async openActiveSessionView(preferPopout = false): Promise<void> {
    const session = this.activeSession;
    if (!session) {
      new Notice("No active session. Start one from a routine or plan first.");
      return;
    }

    const [existing] = this.app.workspace.getLeavesOfType(
      this.viewTypeForSession(session)
    );
    if (existing && !preferPopout) {
      this.sessionLeaf = existing;
      const view = existing.view;
      if (view instanceof WorkoutSessionView && !view.session) {
        view.setSession(session);
      } else if (view instanceof CircuitSessionView && !view.session) {
        view.setSession(session);
      }
      void this.app.workspace.revealLeaf(existing);
      return;
    }

    await this.openSessionView(preferPopout);
  }

  /** Closes the session panel, including a leaf restored after an app restart. */
  private async closeSessionView(): Promise<void> {
    const leaves = new Set<WorkspaceLeaf>([
      ...this.app.workspace.getLeavesOfType(WORKOUT_SESSION_VIEW_TYPE),
      ...this.app.workspace.getLeavesOfType(CIRCUIT_SESSION_VIEW_TYPE),
    ]);
    if (this.sessionLeaf) {
      leaves.add(this.sessionLeaf);
    }
    for (const leaf of leaves) {
      try {
        await leaf.setViewState({ type: "empty" });
      } catch (error) {
        console.debug("Workout Journal: session leaf already closed.", error);
      }
    }
    this.sessionLeaf = null;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as WorkoutTrackerSettings;
    if (!this.settings.migration) {
      this.settings.migration = {
        completed: false,
        exerciseCount: 0,
        routineCount: 0,
      };
    }

    if (this.fileService) {
      this.fileService.setSettings(this.settings);
    }
    if (this.definitionService) {
      this.definitionService.setSettings(this.settings);
    }
    if (this.performanceCsvService) {
      this.performanceCsvService.setPath(this.settings.performanceCsvPath);
    }
    if (this.catalogImportService) {
      this.catalogImportService.setSettings(this.settings);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.fileService) {
      this.fileService.setSettings(this.settings);
    }
    if (this.definitionService) {
      this.definitionService.setSettings(this.settings);
    }
    if (this.performanceCsvService) {
      this.performanceCsvService.setPath(this.settings.performanceCsvPath);
    }
    if (this.catalogImportService) {
      this.catalogImportService.setSettings(this.settings);
    }
  }

  /** Word-set matcher over the bundled catalog, built on first use. */
  get catalogMatcher(): CatalogMatcher {
    if (!this.catalogMatcherInstance) {
      this.catalogMatcherInstance = new CatalogMatcher(this.catalogService.loadIndex());
    }
    return this.catalogMatcherInstance;
  }

  /**
   * Opens the catalog picker for an exercise note that already exists and
   * writes the chosen description into it. Never renames the note.
   */
  async attachCatalogDescription(file: TFile): Promise<void> {
    const definition = await this.definitionService.loadExerciseFromFile(file);
    if (!definition) {
      new Notice("This note is not an exercise note.");
      return;
    }

    new CatalogPickerModal(
      this.app,
      this.catalogService.loadIndex(),
      this.catalogMatcher,
      definition.name,
      (record) => {
        void (async () => {
          try {
            if (definition.description) {
              const replace = await ConfirmChoiceModal.ask(this.app, {
                title: "Replace description?",
                message: `"${definition.name}" already has a description. Replace it with the one from the catalog? Your notes are not affected.`,
                confirmLabel: "Replace",
              });
              if (!replace) return;
            }
            await this.catalogImportService.enrichExistingNote(file, record);
            new Notice(`Added the catalog description to "${definition.name}".`);
          } catch (error) {
            console.error("Workout Journal: could not attach the description", error);
            new Notice("Could not attach the description. See the console for details.");
          }
        })();
      }
    ).open();
  }

  async createWorkoutFile(workout: Workout): Promise<void> {
    try {
      await this.fileService.saveWorkout(workout);
    } catch (error) {
      new Notice(`Error creating workout file: ${error instanceof Error ? error.message : String(error)}`);
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
      new Notice(`Error loading workout file: ${error instanceof Error ? error.message : String(error)}`);
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
    if (routine.isCircle) {
      await this.startCircuitSession(resolved.resolved, preferPopout, plan);
      return;
    }
    const exerciseDefs = await this.definitionService.loadExerciseDefinitions();
    const exerciseNotesMap = new Map(
      exerciseDefs
        .filter((def) => def.notes)
        .map((def) => [def.id, def.notes])
    );
    const exerciseFilePathMap = new Map(
      exerciseDefs
        .filter((def) => def.filePath)
        .map((def) => [def.id, def.filePath])
    );
    const exerciseLastPerformedMap = new Map(
      exerciseDefs.map((def) => [
        def.id,
        {
          reps: def.lastPerformedReps,
          weight: def.lastPerformedWeight,
        },
      ])
    );
    const exerciseTypeMap = new Map(
      exerciseDefs.map((def) => [def.id, def.type])
    );
    const session = await this.workoutSessionService.createSessionFromRoutine(
      resolved.resolved,
      {
        planId: plan?.id,
        planName: plan?.name,
        exerciseNotesMap,
        exerciseFilePathMap,
        exerciseLastPerformedMap,
        exerciseTypeMap,
      }
    );
    this.setActiveSession(session);
    await this.openSessionView(preferPopout);
  }

  async openRoutineEditor(file: TFile): Promise<void> {
    const routine = await this.definitionService.loadRoutineFromFile(file);
    if (!routine) {
      new Notice("This note is not a valid routine definition.");
      return;
    }

    const exerciseDefs = await this.definitionService.loadExerciseDefinitions();
    const exerciseById = new Map(exerciseDefs.map((d) => [d.id, d]));

    const session: WorkoutSession = {
      id: generateId(),
      date: new Date().toISOString().split("T")[0],
      name: routine.name,
      routineId: routine.id,
      routineName: routine.name,
      exercises: routine.exercises.map((entry) => {
        const def = exerciseById.get(entry.exerciseId);
        return {
          exerciseId: entry.exerciseId,
          exerciseName: entry.exerciseName,
          exerciseType: def?.type,
          exerciseFilePath: def?.filePath,
          exerciseNotes: def?.notes,
          sets: entry.sets.map((s, i) => ({
            setIndex: i + 1,
            targetReps: s.reps,
            targetWeight: s.weight,
            actualReps: s.reps,
            actualWeight: s.weight,
            duration: s.duration,
            distance: s.distance,
            restTime: s.restTime,
            setType: s.setType,
            completed: false,
          })),
          completed: false,
          notes: entry.notes,
        };
      }),
      notes: routine.notes,
      hasRoutineChanges: false,
      routineEditMode: true,
      editingRoutineFilePath: file.path,
      isCircle: routine.isCircle,
    };

    this.setActiveSession(session);
    await this.openSessionView(false);
  }

  async saveRoutineFromSession(): Promise<void> {
    const session = this.activeSession;
    if (!session?.routineEditMode || !session.editingRoutineFilePath) return;

    const file = this.app.vault.getAbstractFileByPath(session.editingRoutineFilePath);
    if (!(file instanceof TFile)) {
      new Notice("Could not find the routine file to save.");
      return;
    }

    const existing = await this.definitionService.loadRoutineFromFile(file);
    if (!existing) {
      new Notice("Could not read the routine to update.");
      return;
    }

    const updated: RoutineDefinition = {
      ...existing,
      exercises: session.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        exerciseLink: ex.exerciseFilePath
          ? `[[${ex.exerciseFilePath.replace(/\.md$/, "")}]]`
          : undefined,
        sets: ex.sets.map((s) => ({
          reps: s.targetReps,
          weight: s.targetWeight,
          duration: s.duration,
          distance: s.distance,
          restTime: s.restTime,
          setType: s.setType,
        })),
        notes: ex.notes,
      })),
      notes: session.notes,
    };

    await this.definitionService.updateRoutineDefinition(updated);
    new Notice(`Routine "${updated.name}" saved.`);

    this.setActiveSession(null);
    await this.closeSessionView();
  }

  async startQuickLogSession(preferPopout: boolean): Promise<void> {
    const routineDef: RoutineDefinition = {
      id: `untitled-${generateId()}`,
      name: "untitled",
      exercises: [],
    };
    await this.startSessionFromRoutine(routineDef, preferPopout);
  }

  finishActiveSessionFromView(): void {
    const session = this.activeSession;
    if (!session) {
      new Notice("No active session to finish.");
      return;
    }
    const hasUnfinishedSets = session.exercises.some((exercise) =>
      exercise.sets.some((set) => !set.completed)
    );

    new SessionFinishModal(
      this.app,
      hasUnfinishedSets,
      getSessionDurationMinutes(session),
      (options) => {
        void this.finishActiveSession(options);
      }
    ).open();
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

    const workout = this.workoutSessionService.toWorkoutLog(
      sessionToSave,
      options.durationMinutes
    );
    await this.createWorkoutFile(workout);
    await this.performanceCsvService.appendSession(sessionToSave);
    if (options.storeNewTargets) {
      await this.performanceCsvService.appendTargetUpdate(sessionToSave);
    }
    await this.storeLastPerformedValues(sessionToSave);

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

    this.setActiveSession(null);
    await this.closeSessionView();
    new Notice("Workout finished and saved.");
  }

  async cancelActiveSession(): Promise<void> {
    this.setActiveSession(null);
    await this.closeSessionView();
    new Notice("Workout session cancelled.");
  }

  /**
   * Circuit routines run in the guided player instead of the tracking view.
   * Only duration-only exercises can be timed, so anything else is dropped with
   * a warning rather than silently breaking the timeline.
   */
  private async startCircuitSession(
    routine: RoutineDefinition,
    preferPopout: boolean,
    plan?: WorkoutPlanDefinition
  ): Promise<void> {
    const exerciseDefs = await this.definitionService.loadExerciseDefinitions();
    const defById = new Map(exerciseDefs.map((def) => [def.id, def]));

    const skipped: string[] = [];
    const usable = routine.exercises.filter((entry) => {
      const def = defById.get(entry.exerciseId);
      if (def?.type === "duration-only") return true;
      skipped.push(entry.exerciseName);
      return false;
    });

    if (skipped.length) {
      new Notice(
        `Circuit "${routine.name}" skips ${skipped.join(", ")} — a circuit can only contain duration-only exercises.`
      );
    }
    if (!usable.length) {
      new Notice(
        `Circuit "${routine.name}" has no duration-only exercises to run.`
      );
      return;
    }

    const circuitRoutine: RoutineDefinition = { ...routine, exercises: usable };

    new CircuitStartModal(this.app, circuitRoutine, (rounds) => {
      void (async () => {
        const session: WorkoutSession = {
          id: generateId(),
          date: new Date().toISOString().split("T")[0],
          name: routine.name,
          routineId: routine.id,
          routineName: routine.name,
          planId: plan?.id,
          planName: plan?.name,
          isCircle: true,
          circuitRounds: rounds,
          hasRoutineChanges: false,
          startedAt: Date.now(),
          notes: routine.notes,
          exercises: usable.map((entry) => {
            const def = defById.get(entry.exerciseId);
            const set = entry.sets[0];
            return {
              exerciseId: entry.exerciseId,
              exerciseName: entry.exerciseName,
              exerciseType: def?.type,
              exerciseFilePath: def?.filePath,
              exerciseNotes: def?.notes,
              completed: false,
              notes: entry.notes,
              sets: [
                {
                  setIndex: 1,
                  duration:
                    set?.duration ??
                    def?.defaultDuration ??
                    DEFAULT_CIRCUIT_WORK_SECONDS,
                  restTime: set?.restTime ?? DEFAULT_CIRCUIT_REST_SECONDS,
                  completed: false,
                },
              ],
            };
          }),
        };

        this.setActiveSession(session);
        await this.openSessionView(preferPopout, true);
      })();
    }).open();
  }

  /** Opens the post-circuit overview once the player has finished or stopped. */
  openCircuitSummary(
    performed: Array<{ exerciseIndex: number; seconds: number[] }>
  ): void {
    const session = this.activeSession;
    if (!session) return;

    new CircuitSummaryModal(
      this.app,
      session,
      performed,
      (result) => {
        void this.finishCircuitSession(session, performed, result);
      },
      () => {
        void this.cancelActiveSession();
      }
    ).open();
  }

  private async finishCircuitSession(
    session: WorkoutSession,
    performed: Array<{ exerciseIndex: number; seconds: number[] }>,
    result: CircuitFinishResult
  ): Promise<void> {
    const performedByIndex = new Map(
      performed.map((entry) => [entry.exerciseIndex, entry.seconds])
    );

    // The log records the intervals actually performed, one set per round.
    const workout: Workout = {
      id: session.id,
      date: session.date,
      name: session.name,
      duration: getSessionDurationMinutes(session),
      sourceRoutineId: session.routineId,
      sourcePlanId: session.planId,
      notes: session.notes,
      exercises: session.exercises
        .map((exercise, index) => ({
          name: exercise.exerciseName,
          notes: exercise.notes,
          sets: (performedByIndex.get(index) ?? []).map((seconds) => ({
            duration: seconds,
          })),
        }))
        .filter((exercise) => exercise.sets.length > 0),
    };

    await this.createWorkoutFile(workout);

    if (result.updateRoutine && session.routineId) {
      const routine = await this.definitionService.loadRoutineById(session.routineId);
      if (routine) {
        const byExerciseId = new Map(
          result.adjustments.map((adjustment) => [adjustment.exerciseId, adjustment])
        );
        const updated: RoutineDefinition = {
          ...routine,
          exercises: routine.exercises.map((entry) => {
            const adjustment = byExerciseId.get(entry.exerciseId);
            if (!adjustment) return entry;
            return {
              ...entry,
              sets: [
                {
                  ...(entry.sets[0] ?? {}),
                  duration: adjustment.workSeconds,
                  restTime: adjustment.restSeconds,
                },
              ],
            };
          }),
        };
        await this.definitionService.updateRoutineDefinition(updated);
      }
    }

    this.setActiveSession(null);
    await this.closeSessionView();
    new Notice("Circuit finished and saved.");
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
      new PlanSelectionModal(this.app, [plan], routines, (selectedPlan, selectedRoutine) => {
        void this.startSessionFromRoutine(selectedRoutine, true, selectedPlan);
      }).open();
      return;
    }

    const exercise = await this.definitionService.loadExerciseFromFile(file);
    if (exercise) {
      const reps = exercise.lastPerformedReps ?? exercise.defaultReps;
      const weight = exercise.lastPerformedWeight ?? exercise.defaultWeight;
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
              reps,
              weight,
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

  private async openSessionView(
    preferPopout: boolean,
    autoStartCircuit = false
  ): Promise<void> {
    let leaf: WorkspaceLeaf | null = null;
    if (preferPopout && !Platform.isMobile) {
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
      type: this.activeSession
        ? this.viewTypeForSession(this.activeSession)
        : WORKOUT_SESSION_VIEW_TYPE,
      active: true,
    });
    void this.app.workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (!this.activeSession) return;
    if (view instanceof WorkoutSessionView) {
      view.setSession(this.activeSession);
    } else if (view instanceof CircuitSessionView) {
      view.setSession(this.activeSession, autoStartCircuit);
    }
  }

  async createExerciseNoteFromPrompt(onSave: () => void = () => {}): Promise<void> {
    new ExerciseDefinitionModal(this.app, this, onSave).open();
  }

  async createRoutineNoteFromPrompt(
    isCircle = false,
    onSave: () => void = () => {}
  ): Promise<void> {
    new RoutineBuilderModal(this.app, this, onSave, { isCircle }).open();
  }

  private async storeLastPerformedValues(session: WorkoutSession): Promise<void> {
    const definitions = await this.definitionService.loadExerciseDefinitions();
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    const byName = new Map(definitions.map((definition) => [definition.name, definition]));

    for (const exercise of session.exercises) {
      const definition = byId.get(exercise.exerciseId) || byName.get(exercise.exerciseName);
      if (!definition) {
        continue;
      }

      let latestSet: WorkoutSessionSet | undefined;
      for (let i = exercise.sets.length - 1; i >= 0; i--) {
        const set = exercise.sets[i];
        if (set.completed && (set.actualReps !== undefined || set.actualWeight !== undefined)) {
          latestSet = set;
          break;
        }
      }
      if (!latestSet) {
        continue;
      }

      const lastReps = latestSet.actualReps ?? definition.lastPerformedReps;
      const lastWeight = latestSet.actualWeight ?? definition.lastPerformedWeight;
      if (
        definition.lastPerformedReps === lastReps &&
        definition.lastPerformedWeight === lastWeight
      ) {
        continue;
      }

      await this.definitionService.createExerciseDefinition({
        ...definition,
        lastPerformedReps: lastReps,
        lastPerformedWeight: lastWeight,
      });
    }
  }

  private async createRoutineFromWorkoutFile(file: TFile): Promise<void> {
    const workout = await this.fileService.loadWorkout(file);
    if (!workout) {
      new Notice("Current file is not a valid workout file.");
      return;
    }
    const name = await this.prompt("Routine name", workout.name);
    if (!name) return;
    const routine: RoutineDefinition = {
      id: this.createIdFromName(name),
      name,
      exercises: workout.exercises.map((exercise) => ({
        exerciseId: this.createIdFromName(exercise.name),
        exerciseName: exercise.name,
      sets: exercise.sets.map((set) => ({ ...set })),
      })),
      estimatedDuration: workout.duration,
    };
    await this.definitionService.createRoutineDefinition(routine);
    new Notice(`Routine created: ${name}`);
  }

  async createPlanNoteFromPrompt(onSave: () => void = () => {}): Promise<void> {
    const routines = await this.definitionService.loadRoutineDefinitions();
    new PlanBuilderModal(this.app, this, routines, onSave).open();
  }

  private async openExerciseEditor(file: TFile): Promise<void> {
    const def = await this.definitionService.loadExerciseFromFile(file);
    if (!def) {
      new Notice("This note is not a valid exercise definition.");
      return;
    }
    new ExerciseDefinitionModal(this.app, this, () => {}, def).open();
  }

  private async openPlanEditor(file: TFile): Promise<void> {
    const plan = await this.definitionService.loadPlanFromFile(file);
    if (!plan) {
      new Notice("This note is not a valid workout plan.");
      return;
    }
    const routines = await this.definitionService.loadRoutineDefinitions();
    new PlanBuilderModal(this.app, this, routines, () => {}, plan).open();
  }

  async addExampleTemplates(): Promise<void> {
    const exerciseExamples: ExerciseDefinition[] = [
      { id: "bench-press", name: "Bench Press", type: "strength", muscleGroups: ["chest", "triceps"], defaultSets: 3, defaultReps: 8, defaultWeight: 60 },
      { id: "squat", name: "Squat", type: "strength", muscleGroups: ["quads", "glutes"], defaultSets: 4, defaultReps: 6, defaultWeight: 80 },
      { id: "pull-up", name: "Pull-up", type: "strength", muscleGroups: ["back", "biceps"], defaultSets: 3, defaultReps: 8 },
      { id: "running", name: "Running", type: "cardio", muscleGroups: [], defaultDuration: 30, defaultDistance: 5 },
      { id: "plank", name: "Plank", type: "flexibility", muscleGroups: ["core"], defaultSets: 3, defaultDuration: 1 },
      { id: "push-up", name: "Push-up", type: "reps-only", muscleGroups: ["chest", "triceps"], defaultSets: 3, defaultReps: 12 },
      { id: "mountain-climbers", name: "Mountain Climbers", type: "duration-only", muscleGroups: ["core"], defaultSets: 1, defaultDuration: 40 },
      { id: "jumping-jacks", name: "Jumping Jacks", type: "duration-only", muscleGroups: ["full body"], defaultSets: 1, defaultDuration: 40 },
      { id: "high-knees", name: "High Knees", type: "duration-only", muscleGroups: ["legs", "core"], defaultSets: 1, defaultDuration: 40 },
    ];

    for (const def of exerciseExamples) {
      await this.definitionService.createExerciseDefinition(def);
    }

    const routineExamples: RoutineDefinition[] = [
      {
        id: "push-day",
        name: "Push Day",
        estimatedDuration: 60,
        exercises: [
          { exerciseId: "bench-press", exerciseName: "Bench Press", sets: [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }, { reps: 8, weight: 60 }] },
        ],
      },
      {
        id: "morning-circuit",
        name: "Morning Circuit",
        isCircle: true,
        exercises: [
          { exerciseId: "jumping-jacks", exerciseName: "Jumping Jacks", sets: [{ duration: 40, restTime: 20 }] },
          { exerciseId: "mountain-climbers", exerciseName: "Mountain Climbers", sets: [{ duration: 40, restTime: 20 }] },
          { exerciseId: "high-knees", exerciseName: "High Knees", sets: [{ duration: 40, restTime: 20 }] },
        ],
      },
    ];

    for (const routine of routineExamples) {
      await this.definitionService.createRoutineDefinition(routine);
    }

    new Notice(
      `Added ${exerciseExamples.length} example exercises and ${routineExamples.length} example routines.`
    );
  }

  private prompt(label: string, defaultValue?: string): Promise<string | null> {
    return new Promise((resolve) => {
      new InputPromptModal(this.app, label, "Enter value", (value) => {
        resolve(value);
      }, defaultValue).open();
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
      window.clearTimeout(existingTimeout);
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const isWorkout = await this.fileService.isWorkoutFile(file);
          if (!isWorkout) {
            return;
          }
          await this.fileService.syncFrontmatterWithContent(file);
        } catch (error) {
          console.error(`Error syncing frontmatter for ${file.path}:`, error);
        } finally {
          this.syncTimeouts.delete(file.path);
        }
      })();
    }, this.settings.autoSyncDelayMs);

    this.syncTimeouts.set(file.path, timeout);
  }
}
