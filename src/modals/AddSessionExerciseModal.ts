import { App, Modal, Notice, Setting } from "obsidian";
import { ExerciseDefinition, SetType, WorkoutSessionExercise } from "../types";
import WorkoutTrackerPlugin from "../plugin";
import { createIdFromName } from "../utils/idUtils";
import { PerformanceCsvService } from "../utils/performanceCsvService";

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

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    exercises: ExerciseDefinition[],
    onAdd: (exercise: WorkoutSessionExercise) => void,
    csvService: PerformanceCsvService,
    routineId?: string
  ) {
    super(app);
    this.plugin = plugin;
    this.exercises = exercises;
    this.onAdd = onAdd;
    this.csvService = csvService;
    this.routineId = routineId;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Add exercise to session" });

    new Setting(contentEl).setName("Search").addText((text) => {
      text.setPlaceholder("Type to filter exercises…").onChange((value) => {
        this.searchQuery = value;
        this.renderList();
      });
      // Auto-focus the search field
      setTimeout(() => text.inputEl.focus(), 50);
    });

    this.listEl = contentEl.createDiv({ cls: "workout-add-exercise-list" });
    this.renderList();
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

    if (filtered.length === 0) {
      this.listEl.createEl("p", { text: "No exercises found.", cls: "workout-add-exercise-empty" });
      if (this.searchQuery.trim()) {
        const createBtn = this.listEl.createEl("button", {
          text: `Create "${this.searchQuery.trim()}" as new exercise`,
          cls: "workout-add-exercise-create-new",
        });
        createBtn.onclick = async () => {
          await this.createAndAddExercise(this.searchQuery.trim());
        };
      }
      return;
    }

    filtered.forEach((ex) => {
      const item = this.listEl.createDiv({ cls: "workout-add-exercise-item" });
      item.createEl("span", { text: ex.name, cls: "workout-add-exercise-name" });
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
  }

  private async createAndAddExercise(name: string): Promise<void> {
    const id = createIdFromName(name);
    const def: ExerciseDefinition = {
      id,
      name,
      type: "strength",
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
