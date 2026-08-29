import { App, Modal, Notice, Setting } from "obsidian";
import { ExerciseDefinition, ExerciseType, SetType, WorkoutSessionExercise } from "../types";
import WorkoutTrackerPlugin from "../plugin";
import { createIdFromName } from "../utils/idUtils";
import { PerformanceCsvService } from "../utils/performanceCsvService";
import {
  DEFAULT_CIRCUIT_WORK_SECONDS,
  EXERCISE_TYPE_LABELS,
  isDurationOnly,
} from "../utils/exerciseTypeUtils";
import { CatalogExercise } from "../utils/catalogService";
import { toTitleCase } from "../utils/titleCase";
import { CatalogPickerModal } from "./CatalogPickerModal";

const VALID_SET_TYPES = new Set<SetType>(["default", "warmup", "dropset", "myoreps"]);

function normalizeSetType(value: string | undefined): SetType | undefined {
  if (!value || !VALID_SET_TYPES.has(value as SetType) || value === "default") {
    return undefined;
  }
  return value as SetType;
}

const DEFAULT_NUM_SETS = 3;

export class AddSessionExerciseModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private exercises: ExerciseDefinition[];
  private onAdd: (exercise: WorkoutSessionExercise) => void;
  private searchQuery = "";
  private listEl: HTMLElement;
  private csvService: PerformanceCsvService;
  private routineId: string | undefined;
  /** When set, only exercises of this type can be picked or created. */
  private restrictToType: ExerciseType | undefined;

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    exercises: ExerciseDefinition[],
    onAdd: (exercise: WorkoutSessionExercise) => void,
    csvService: PerformanceCsvService,
    routineId?: string,
    restrictToType?: ExerciseType
  ) {
    super(app);
    this.plugin = plugin;
    this.onAdd = onAdd;
    this.csvService = csvService;
    this.routineId = routineId;
    this.restrictToType = restrictToType;
    this.exercises = restrictToType
      ? exercises.filter((exercise) => exercise.type === restrictToType)
      : exercises;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Add exercise to session" });

    if (this.restrictToType) {
      contentEl.createEl("p", {
        text: `Only ${EXERCISE_TYPE_LABELS[this.restrictToType].toLowerCase()} exercises can be used here.`,
        cls: "setting-item-description",
      });
    }

    new Setting(contentEl).setName("Search").addText((text) => {
      text.setPlaceholder("Type to filter exercises…").onChange((value) => {
        this.searchQuery = value;
        this.renderList();
      });
      // Auto-focus the search field
      window.setTimeout(() => text.inputEl.focus(), 50);
    });

    // The inline group below only surfaces substring hits on what has been
    // typed. This opens the whole catalog with fuzzy matching, which is the
    // faster route when the name you want is not what the dataset calls it.
    new Setting(contentEl)
      .setName("Not in your library?")
      .setDesc(
        this.restrictToType === "cardio"
          ? "Search the cardio entries in the exercise catalog."
          : `Search all ${this.plugin.catalogService.size} exercises in the catalog.`
      )
      .addButton((btn) =>
        btn
          .setButtonText("Search catalog")
          .onClick(() => this.openCatalogSearch())
      );

    this.listEl = contentEl.createDiv({ cls: "workout-add-exercise-list" });
    this.renderList();
  }

  /**
   * Full-catalog search, seeded with whatever is already typed. Picking a
   * record imports it and adds it to the session in one step, exactly like the
   * inline catalog rows.
   */
  private openCatalogSearch(): void {
    new CatalogPickerModal(
      this.app,
      this.catalogCandidates(),
      this.plugin.catalogMatcher,
      this.searchQuery.trim(),
      (record) => {
        void this.importAndAdd(record);
      },
      "add to session"
    ).open();
  }

  private renderList() {
    this.listEl.empty();
    const q = this.searchQuery.toLowerCase();
    const filtered = this.exercises.filter(
      (ex) =>
        !q ||
        ex.name.toLowerCase().includes(q) ||
        ex.muscleGroups.some((mg) => mg.toLowerCase().includes(q))
    );

    if (filtered.length === 0 && !this.searchQuery.trim()) {
      this.listEl.createEl("p", { text: "No exercises found.", cls: "workout-add-exercise-empty" });
      return;
    }

    filtered.forEach((ex) => {
      const item = this.listEl.createDiv({ cls: "workout-add-exercise-item" });
      item.createSpan({ text: ex.name, cls: "workout-add-exercise-name" });
      if (ex.muscleGroups?.length) {
        item.createEl("small", {
          text: ex.muscleGroups.join(", "),
          cls: "workout-add-exercise-muscles",
        });
      }
      item.addEventListener("click", () => {
        void (async () => {
          this.onAdd(await this.buildSessionExercise(ex));
          this.close();
        })();
      });
    });

    this.renderCatalogGroup(filtered.length);
  }

  /**
   * Catalog records this picker is allowed to offer.
   *
   * Only the cardio split can be derived from the dataset, so a picker
   * restricted to cardio filters on it; for the other restricted types the
   * catalog cannot honestly promise a match, and the record is retyped on
   * import via `typeOverride` instead.
   */
  private catalogCandidates(): CatalogExercise[] {
    const index = this.plugin.catalogService.loadIndex();
    if (this.restrictToType === "cardio") {
      return index.filter((record) => record.bodyPart === "cardio");
    }
    return index;
  }

  /**
   * Catalog results sit below the user's own exercises, dimmed.
   *
   * Picking one writes the note and uses it immediately, so importing is a side
   * effect of doing the thing you wanted rather than a separate chore — which is
   * what keeps the exercise folder to exactly what someone actually trains.
   */
  private renderCatalogGroup(ownCount: number): void {
    const query = this.searchQuery.trim();
    if (!query) return;

    const owned = new Set(this.exercises.map((ex) => ex.name.toLowerCase()));
    const matches = this.catalogCandidates()
      .filter(
        (record) =>
          record.name.toLowerCase().includes(query.toLowerCase()) &&
          !owned.has(toTitleCase(record.name).toLowerCase())
      )
      .slice(0, 8);

    if (matches.length) {
      this.listEl.createEl("p", {
        text: ownCount ? "From the exercise catalog" : "Not in your library yet — from the catalog",
        cls: "workout-add-exercise-group-label",
      });

      for (const record of matches) {
        const item = this.listEl.createDiv({
          cls: "workout-add-exercise-item workout-add-exercise-item-catalog",
        });
        item.createSpan({
          text: toTitleCase(record.name),
          cls: "workout-add-exercise-name",
        });
        item.createEl("small", {
          text: [record.equipment, record.target].filter(Boolean).join(", "),
          cls: "workout-add-exercise-muscles",
        });
        item.addEventListener("click", () => {
          void this.importAndAdd(record);
        });
      }
    }

    const createBtn = this.listEl.createEl("button", {
      text: `Create "${query}" as new exercise`,
      cls: "workout-add-exercise-create-new",
    });
    createBtn.onclick = async () => {
      await this.createAndAddExercise(query);
    };
  }

  private async importAndAdd(record: CatalogExercise): Promise<void> {
    try {
      const result = await this.plugin.catalogImportService.importRecord(record, {
        typeOverride: this.restrictToType,
      });
      const def = result.file
        ? { ...result.definition, filePath: result.file.path }
        : result.definition;
      new Notice(`Exercise note created: ${def.name}`);
      this.onAdd(await this.buildSessionExercise(def));
      this.close();
    } catch (error) {
      console.error("Workout Journal: could not import from the catalog", error);
      new Notice("Could not import that exercise. See the console for details.");
    }
  }

  private async createAndAddExercise(name: string): Promise<void> {
    const id = createIdFromName(name);
    const type = this.restrictToType ?? "strength";
    const def: ExerciseDefinition = isDurationOnly(type)
      ? {
          id,
          name,
          type,
          muscleGroups: [],
          defaultSets: 1,
          defaultDuration: DEFAULT_CIRCUIT_WORK_SECONDS,
        }
      : {
          id,
          name,
          type,
          muscleGroups: [],
          defaultSets: DEFAULT_NUM_SETS,
          defaultReps: 8,
        };
    const file = await this.plugin.definitionService.createExerciseDefinition(def);
    if (file) {
      def.filePath = file.path;
    }
    new Notice(`Exercise note created: ${name}`);
    this.onAdd(await this.buildSessionExercise(def));
    this.close();
  }

  private async buildSessionExercise(ex: ExerciseDefinition): Promise<WorkoutSessionExercise> {
    // duration-only exercises carry no reps/weight history worth restoring.
    if (isDurationOnly(ex.type)) {
      const numSets = ex.defaultSets ?? 1;
      return {
        exerciseId: ex.id,
        exerciseName: ex.name,
        exerciseType: ex.type,
        sets: Array.from({ length: numSets }, (_, i) => ({
          setIndex: i + 1,
          duration: ex.defaultDuration ?? DEFAULT_CIRCUIT_WORK_SECONDS,
          completed: false,
        })),
        completed: false,
        exerciseNotes: ex.notes || undefined,
        exerciseFilePath: ex.filePath,
      };
    }

    const lastSets = await this.csvService.getLatestSetsForExercise(this.routineId, ex.id);
    if (lastSets && lastSets.length > 0) {
      const sets = lastSets.map((s) => ({
        setIndex: s.setIndex,
        previousReps: s.reps,
        previousWeight: s.weight,
        targetReps: s.reps,
        targetWeight: s.weight,
        actualReps: s.reps,
        actualWeight: s.weight,
        duration: ex.defaultDuration,
        distance: ex.defaultDistance,
        completed: false,
        setType: normalizeSetType(s.setType),
      }));
      return {
        exerciseId: ex.id,
        exerciseName: ex.name,
        exerciseType: ex.type,
        sets,
        completed: false,
        exerciseNotes: ex.notes || undefined,
        exerciseFilePath: ex.filePath,
      };
    }

    const numSets = ex.defaultSets ?? DEFAULT_NUM_SETS;
    const reps = ex.lastPerformedReps ?? ex.defaultReps;
    const weight = ex.lastPerformedWeight ?? ex.defaultWeight;
    const sets = Array.from({ length: numSets }, (_, i) => ({
      setIndex: i + 1,
      targetReps: reps,
      targetWeight: weight,
      actualReps: reps,
      actualWeight: weight,
      duration: ex.defaultDuration,
      distance: ex.defaultDistance,
      completed: false,
    }));
    return {
      exerciseId: ex.id,
      exerciseName: ex.name,
      exerciseType: ex.type,
      sets,
      completed: false,
      exerciseNotes: ex.notes || undefined,
      exerciseFilePath: ex.filePath,
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
