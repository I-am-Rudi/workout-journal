import { App, Modal, Notice, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import {
  ExerciseDefinition,
  RoutineDefinition,
  RoutineExerciseEntry,
} from "../types";
import { createIdFromName } from "../utils/idUtils";
import {
  DEFAULT_CIRCUIT_REST_SECONDS,
  DEFAULT_CIRCUIT_WORK_SECONDS,
  isDurationOnly,
} from "../utils/exerciseTypeUtils";

const DEFAULT_SETS = 3;
const DEFAULT_REPS = 8;

/**
 * Full editor for a routine note: name, circuit flag, notes and the exercise
 * list, so creating a routine does not stop at a bare name.
 */
export class RoutineBuilderModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private onSave: (routine?: RoutineDefinition) => void;
  private existing: RoutineDefinition | undefined;
  private availableExercises: ExerciseDefinition[] = [];

  private name = "";
  private isCircle = false;
  private estimatedDuration: number | undefined = 60;
  private notes = "";
  private entries: RoutineExerciseEntry[] = [];

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    onSave: (routine?: RoutineDefinition) => void,
    options?: { isCircle?: boolean; existing?: RoutineDefinition }
  ) {
    super(app);
    this.plugin = plugin;
    this.onSave = onSave;
    this.existing = options?.existing;
    this.isCircle = options?.existing?.isCircle ?? options?.isCircle ?? false;
    if (this.existing) {
      this.name = this.existing.name;
      this.estimatedDuration = this.existing.estimatedDuration;
      this.notes = this.existing.notes ?? "";
      this.entries = this.existing.exercises.map((entry) => ({
        ...entry,
        sets: entry.sets.map((set) => ({ ...set })),
      }));
    } else if (this.isCircle) {
      this.estimatedDuration = undefined;
    }
  }

  onOpen() {
    void (async () => {
      this.availableExercises =
        await this.plugin.definitionService.loadExerciseDefinitions();
      this.render();
    })();
  }

  private get pickableExercises(): ExerciseDefinition[] {
    return this.isCircle
      ? this.availableExercises.filter((exercise) => isDurationOnly(exercise.type))
      : this.availableExercises;
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", {
      text: this.existing
        ? "Edit routine"
        : this.isCircle
          ? "New circuit routine"
          : "New routine",
    });

    new Setting(contentEl).setName("Name").addText((text) =>
      text
        .setPlaceholder(this.isCircle ? "e.g. Morning Circuit" : "e.g. Push Day")
        .setValue(this.name)
        .onChange((value) => {
          this.name = value.trim();
        })
    );

    new Setting(contentEl)
      .setName("Circuit")
      .setDesc(
        "Runs as a guided timer instead of a tracked session. Duration-only exercises only."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.isCircle).onChange((value) => {
          this.isCircle = value;
          if (value) {
            // Anything that cannot be timed would be skipped at start anyway.
            this.entries = this.entries.filter((entry) =>
              isDurationOnly(this.exerciseById(entry.exerciseId)?.type)
            );
            this.estimatedDuration = undefined;
          }
          this.render();
        })
      );

    if (!this.isCircle) {
      new Setting(contentEl).setName("Estimated duration (min)").addText((text) =>
        text
          .setPlaceholder("60")
          .setValue(this.estimatedDuration !== undefined ? String(this.estimatedDuration) : "")
          .onChange((value) => {
            const parsed = parseInt(value);
            this.estimatedDuration = Number.isNaN(parsed) ? undefined : parsed;
          })
      );
    }

    new Setting(contentEl).setName("Notes").addTextArea((text) =>
      text.setValue(this.notes).onChange((value) => {
        this.notes = value;
      })
    );

    new Setting(contentEl).setName("Exercises").setHeading();

    const entriesEl = contentEl.createDiv();
    this.renderEntries(entriesEl);

    const picker = new Setting(contentEl).setName("Add exercise");
    const pickable = this.pickableExercises;
    if (!pickable.length) {
      picker.setDesc(
        this.isCircle
          ? "No duration-only exercise notes found. Create one first."
          : "No exercise notes found. Create one first."
      );
    } else {
      let pickedId = pickable[0].id;
      picker.addDropdown((dropdown) => {
        for (const exercise of pickable) {
          dropdown.addOption(exercise.id, exercise.name);
        }
        dropdown.setValue(pickedId);
        dropdown.onChange((value) => {
          pickedId = value;
        });
      });
      picker.addButton((btn) =>
        btn.setButtonText("Add").onClick(() => {
          const exercise = pickable.find((candidate) => candidate.id === pickedId);
          if (!exercise) return;
          this.entries.push(this.buildEntry(exercise));
          this.render();
        })
      );
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(this.existing ? "Update routine" : "Create routine")
          .setCta()
          .onClick(() => {
            void this.save();
          })
      )
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }

  private buildEntry(exercise: ExerciseDefinition): RoutineExerciseEntry {
    const link = exercise.filePath
      ? `[[${exercise.filePath.replace(/\.md$/, "")}]]`
      : undefined;
    if (this.isCircle || isDurationOnly(exercise.type)) {
      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        exerciseLink: link,
        sets: [
          {
            duration: exercise.defaultDuration ?? DEFAULT_CIRCUIT_WORK_SECONDS,
            restTime: DEFAULT_CIRCUIT_REST_SECONDS,
          },
        ],
      };
    }
    const setCount = exercise.defaultSets ?? DEFAULT_SETS;
    return {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      exerciseLink: link,
      sets: Array.from({ length: setCount }, () => ({
        reps: exercise.defaultReps ?? DEFAULT_REPS,
        weight: exercise.defaultWeight,
      })),
    };
  }

  private renderEntries(container: HTMLElement): void {
    container.empty();

    if (!this.entries.length) {
      container.createEl("p", {
        text: "No exercises added yet.",
        cls: "setting-item-description",
      });
      return;
    }

    this.entries.forEach((entry, index) => {
      const setting = new Setting(container).setName(entry.exerciseName);

      if (this.isCircle) {
        setting.setDesc("Work / pause in seconds");
        setting.addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "0";
          text.inputEl.addClass("workout-circuit-time-input");
          text.inputEl.setAttr("aria-label", `${entry.exerciseName} work seconds`);
          text.setValue(String(entry.sets[0]?.duration ?? DEFAULT_CIRCUIT_WORK_SECONDS));
          text.onChange((value) => {
            const parsed = parseInt(value);
            entry.sets[0].duration = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
          });
        });
        setting.addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "0";
          text.inputEl.addClass("workout-circuit-time-input");
          text.inputEl.setAttr("aria-label", `${entry.exerciseName} pause seconds`);
          text.setValue(String(entry.sets[0]?.restTime ?? DEFAULT_CIRCUIT_REST_SECONDS));
          text.onChange((value) => {
            const parsed = parseInt(value);
            entry.sets[0].restTime = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
          });
        });
      } else {
        setting.setDesc("Sets × reps");
        setting.addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "1";
          text.inputEl.addClass("workout-routine-count-input");
          text.inputEl.setAttr("aria-label", `${entry.exerciseName} set count`);
          text.setValue(String(entry.sets.length));
          text.onChange((value) => {
            const parsed = parseInt(value);
            const count = Number.isNaN(parsed) ? 1 : Math.max(1, Math.min(20, parsed));
            const template = entry.sets[entry.sets.length - 1] ?? { reps: DEFAULT_REPS };
            while (entry.sets.length > count) entry.sets.pop();
            while (entry.sets.length < count) entry.sets.push({ ...template });
          });
        });
        setting.addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "0";
          text.inputEl.addClass("workout-routine-count-input");
          text.inputEl.setAttr("aria-label", `${entry.exerciseName} reps`);
          text.setValue(String(entry.sets[0]?.reps ?? DEFAULT_REPS));
          text.onChange((value) => {
            const parsed = parseInt(value);
            const reps = Number.isNaN(parsed) ? undefined : Math.max(0, parsed);
            entry.sets.forEach((set) => {
              set.reps = reps;
            });
          });
        });
      }

      setting.addExtraButton((btn) =>
        btn
          .setIcon("arrow-up")
          .setTooltip("Move up")
          .setDisabled(index === 0)
          .onClick(() => {
            const [moved] = this.entries.splice(index, 1);
            this.entries.splice(index - 1, 0, moved);
            this.render();
          })
      );
      setting.addExtraButton((btn) =>
        btn
          .setIcon("arrow-down")
          .setTooltip("Move down")
          .setDisabled(index === this.entries.length - 1)
          .onClick(() => {
            const [moved] = this.entries.splice(index, 1);
            this.entries.splice(index + 1, 0, moved);
            this.render();
          })
      );
      setting.addExtraButton((btn) =>
        btn
          .setIcon("x")
          .setTooltip("Remove")
          .onClick(() => {
            this.entries.splice(index, 1);
            this.render();
          })
      );
    });
  }

  private exerciseById(id: string): ExerciseDefinition | undefined {
    return this.availableExercises.find((exercise) => exercise.id === id);
  }

  private async save(): Promise<void> {
    if (!this.name) {
      new Notice("Routine name is required.");
      return;
    }

    const routine: RoutineDefinition = {
      id: this.existing?.id ?? createIdFromName(this.name),
      name: this.name,
      exercises: this.entries,
      estimatedDuration: this.isCircle ? undefined : this.estimatedDuration,
      notes: this.notes || undefined,
      isCircle: this.isCircle || undefined,
      filePath: this.existing?.filePath,
      planTags: this.existing?.planTags,
    };

    if (this.existing?.filePath) {
      await this.plugin.definitionService.updateRoutineDefinition(routine);
    } else {
      const file = await this.plugin.definitionService.createRoutineDefinition(routine);
      if (file) routine.filePath = file.path;
    }
    new Notice(`Routine saved: ${routine.name}`);
    this.onSave(routine);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
