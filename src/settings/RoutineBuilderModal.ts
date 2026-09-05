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
import {
  createActionBar,
  createButton,
  createHint,
  createIconButton,
  createList,
  createRow,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

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
    markPluginModal(contentEl);
    renderHeader(contentEl, {
      title: this.existing
        ? "Edit routine"
        : this.isCircle
          ? "New circuit routine"
          : "New routine",
      subtitle: this.isCircle
        ? "Runs as a guided timer through duration-only exercises"
        : "Saved as a routine note you can start any time",
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

    const notesSetting = new Setting(contentEl).setName("Notes").addTextArea((text) =>
      text.setValue(this.notes).onChange((value) => {
        this.notes = value;
      })
    );
    // A free-text field wants the width of the row, not the control column.
    notesSetting.settingEl.addClass("wj-setting-stacked");

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

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: this.existing ? "Update routine" : "Create routine",
      variant: "primary",
      onClick: () => {
        void this.save();
      },
    });
    createButton(actions, {
      label: "Cancel",
      variant: "quiet",
      onClick: () => this.close(),
    });
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
      createHint(
        container,
        this.isCircle
          ? "No stations yet — add duration-only exercises below."
          : "No exercises yet — add them below."
      );
      return;
    }

    const list = createList(container);
    this.entries.forEach((entry, index) => {
      const { row, actions } = createRow(list, {
        title: entry.exerciseName,
        meta: this.isCircle ? "Work / pause in seconds" : "Sets × reps",
      });
      row.addClass("wj-row-editable");

      if (this.isCircle) {
        this.createInlineNumber(
          actions,
          `${entry.exerciseName} work seconds`,
          entry.sets[0]?.duration ?? DEFAULT_CIRCUIT_WORK_SECONDS,
          0,
          (value) => {
            entry.sets[0].duration = value ?? 0;
          }
        );
        this.createInlineNumber(
          actions,
          `${entry.exerciseName} pause seconds`,
          entry.sets[0]?.restTime ?? DEFAULT_CIRCUIT_REST_SECONDS,
          0,
          (value) => {
            entry.sets[0].restTime = value ?? 0;
          }
        );
      } else {
        this.createInlineNumber(
          actions,
          `${entry.exerciseName} set count`,
          entry.sets.length,
          1,
          (value) => {
            const count = Math.min(20, Math.max(1, value ?? 1));
            const template = entry.sets[entry.sets.length - 1] ?? { reps: DEFAULT_REPS };
            while (entry.sets.length > count) entry.sets.pop();
            while (entry.sets.length < count) entry.sets.push({ ...template });
          }
        );
        this.createInlineNumber(
          actions,
          `${entry.exerciseName} reps`,
          entry.sets[0]?.reps ?? DEFAULT_REPS,
          0,
          (value) => {
            entry.sets.forEach((set) => {
              set.reps = value;
            });
          }
        );
      }

      createIconButton(
        actions,
        "arrow-up",
        "Move up",
        () => {
          const [moved] = this.entries.splice(index, 1);
          this.entries.splice(index - 1, 0, moved);
          this.render();
        },
        { disabled: index === 0 }
      );
      createIconButton(
        actions,
        "arrow-down",
        "Move down",
        () => {
          const [moved] = this.entries.splice(index, 1);
          this.entries.splice(index + 1, 0, moved);
          this.render();
        },
        { disabled: index === this.entries.length - 1 }
      );
      createIconButton(
        actions,
        "x",
        "Remove",
        () => {
          this.entries.splice(index, 1);
          this.render();
        },
        { danger: true }
      );
    });
  }

  /**
   * A compact whole-number field that lives inside a row's control cluster.
   * An emptied field reports `undefined` rather than zero, so clearing a reps
   * box does not write a 0 into the routine note.
   */
  private createInlineNumber(
    parent: HTMLElement,
    label: string,
    value: number,
    min: number,
    onChange: (value: number | undefined) => void
  ): HTMLInputElement {
    const input = parent.createEl("input", { type: "number", cls: "wj-inline-input" });
    input.min = String(min);
    input.value = String(value);
    input.setAttr("aria-label", label);
    input.addEventListener("input", () => {
      const parsed = parseInt(input.value);
      onChange(Number.isNaN(parsed) ? undefined : Math.max(min, parsed));
    });
    return input;
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
