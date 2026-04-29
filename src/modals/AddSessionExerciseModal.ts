import { App, Modal, Notice, Setting } from "obsidian";
import { ExerciseDefinition, WorkoutSessionExercise } from "../types";
import WorkoutTrackerPlugin from "../plugin";
import { createIdFromName } from "../utils/idUtils";

const DEFAULT_NUM_SETS = 3;

export class AddSessionExerciseModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private exercises: ExerciseDefinition[];
  private onAdd: (exercise: WorkoutSessionExercise) => void;
  private searchQuery = "";
  private listEl: HTMLElement;

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    exercises: ExerciseDefinition[],
    onAdd: (exercise: WorkoutSessionExercise) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.exercises = exercises;
    this.onAdd = onAdd;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Add Exercise to Session" });

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
        this.onAdd(this.buildSessionExercise(ex));
        this.close();
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
    await this.plugin.definitionService.createExerciseDefinition(def);
    new Notice(`Exercise note created: ${name}`);
    this.onAdd(this.buildSessionExercise(def));
    this.close();
  }

  private buildSessionExercise(ex: ExerciseDefinition): WorkoutSessionExercise {
    const numSets = ex.defaultSets ?? DEFAULT_NUM_SETS;
    const sets = Array.from({ length: numSets }, (_, i) => ({
      setIndex: i + 1,
      targetReps: ex.defaultReps,
      targetWeight: ex.defaultWeight,
      actualReps: ex.defaultReps,
      actualWeight: ex.defaultWeight,
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
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
