import { App, Modal, Notice, Setting } from "obsidian";
import { Exercise, ExerciseSet } from "../types";
import WorkoutTrackerPlugin from "../plugin";
import {
  createActionBar,
  createButton,
  createHint,
  createIconButton,
  createSectionLabel,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

export class ExerciseModal extends Modal {
  plugin: WorkoutTrackerPlugin;
  exercise: Exercise;
  onSubmit: (exercise: Exercise) => void;
  isEditing: boolean;

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    onSubmit: (exercise: Exercise) => void,
    existingExercise?: Exercise
  ) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.isEditing = !!existingExercise;
    this.exercise = existingExercise
      ? { ...existingExercise }
      : {
          name: "",
          sets: [],
        };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl);

    renderHeader(contentEl, {
      title: this.isEditing ? "Edit exercise" : "Add exercise",
    });

    // Exercise name with autocomplete from templates
    const nameContainer = contentEl.createDiv();
    new Setting(nameContainer).setName("Exercise name").addText((text) => {
      text
        .setPlaceholder("Enter exercise name")
        .setValue(this.exercise.name)
        .onChange((value) => {
          this.exercise.name = value;
        });

      // Add datalist for autocomplete
      const datalist = nameContainer.createEl("datalist");
      datalist.id = "exercise-suggestions";
      text.inputEl.setAttribute("list", "exercise-suggestions");

      this.plugin.settings.exerciseTemplates.forEach((template) => {
        const option = datalist.createEl("option");
        option.value = template.name;
      });
    });

    new Setting(contentEl)
      .setName("Template defaults")
      .setDesc("Fill the sets from a matching exercise template.")
      .addButton((btn) =>
        btn.setButtonText("Load from template").onClick(() => {
          void (async () => {
            const template = this.plugin.settings.exerciseTemplates.find(
              (t) => t.name === this.exercise.name
            );
            if (!template?.defaultSets) {
              new Notice("No template matches that exercise name.");
              return;
            }

            const definitions = await this.plugin.definitionService.loadExerciseDefinitions();
            const definition = definitions.find((def) => def.name === template.name);
            const reps = definition?.lastPerformedReps ?? template.defaultReps;
            const weight = definition?.lastPerformedWeight ?? template.defaultWeight;
            for (let i = 0; i < template.defaultSets; i++) {
              this.exercise.sets.push({
                reps,
                weight,
                duration: template.defaultDuration,
              });
            }
            this.renderSets(setsContainer);
          })();
        })
      );

    createSectionLabel(contentEl, "Sets");
    const setsContainer = contentEl.createDiv({ cls: "wj-set-list" });
    this.renderSets(setsContainer);

    new Setting(contentEl).setName("Notes").addTextArea((text) =>
      text
        .setPlaceholder("Exercise notes…")
        .setValue(this.exercise.notes || "")
        .onChange((value) => {
          this.exercise.notes = value;
        })
    );

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: this.isEditing ? "Update exercise" : "Add exercise",
      variant: "primary",
      onClick: () => {
        if (!this.exercise.name) {
          new Notice("Please enter an exercise name");
          return;
        }
        this.onSubmit(this.exercise);
        this.close();
      },
    });
    createButton(actions, {
      label: "Cancel",
      variant: "quiet",
      onClick: () => this.close(),
    });
  }

  renderSets(container: HTMLElement) {
    container.empty();

    if (this.exercise.sets.length === 0) {
      createHint(container, "No sets yet.");
    }

    this.exercise.sets.forEach((set, index) => {
      const row = container.createDiv({ cls: "wj-set-row" });
      row.createDiv({ text: `Set ${index + 1}`, cls: "wj-set-index" });

      const fields = row.createDiv({ cls: "wj-set-fields" });
      this.createField(fields, "Reps", "12", set.reps, (value) => {
        set.reps = value !== undefined ? Math.round(value) : undefined;
      });
      this.createField(
        fields,
        this.plugin.settings.weightUnit,
        "60",
        set.weight,
        (value) => {
          set.weight = value;
        }
      );
      this.createField(fields, "Min", "30", set.duration, (value) => {
        set.duration = value;
      });

      createIconButton(
        row,
        "x",
        `Remove set ${index + 1}`,
        () => {
          this.exercise.sets.splice(index, 1);
          this.renderSets(container);
        },
        { danger: true }
      );
    });

    createButton(container, {
      label: "Add set",
      variant: "ghost",
      onClick: () => {
        const previous: ExerciseSet | undefined =
          this.exercise.sets[this.exercise.sets.length - 1];
        this.exercise.sets.push(previous ? { ...previous } : {});
        this.renderSets(container);
      },
    });
  }

  /** One labelled numeric cell of a set row. */
  private createField(
    parent: HTMLElement,
    label: string,
    placeholder: string,
    value: number | undefined,
    onChange: (value: number | undefined) => void
  ): void {
    const field = parent.createDiv({ cls: "wj-set-field" });
    field.createDiv({ text: label, cls: "wj-set-field-label" });
    const input = field.createEl("input", { type: "number" });
    input.placeholder = placeholder;
    input.setAttr("aria-label", label);
    if (value !== undefined) input.value = String(value);
    input.addEventListener("input", () => {
      const parsed = parseFloat(input.value);
      onChange(input.value && !Number.isNaN(parsed) ? parsed : undefined);
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
