import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { Workout } from "../types";
import { WorkoutFileService } from "../utils/workoutFileService";
import { ExerciseModal } from "./ExerciseModal";
import WorkoutTrackerPlugin from "../plugin";
import {
  createActionBar,
  createButton,
  createHint,
  createIconButton,
  createList,
  createRow,
  createSectionLabel,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

export class WorkoutEditModal extends Modal {
  plugin: WorkoutTrackerPlugin;
  fileService: WorkoutFileService;
  workout: Workout;
  file: TFile;

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    file: TFile,
    workout: Workout
  ) {
    super(app);
    this.plugin = plugin;
    this.fileService = new WorkoutFileService(
      app,
      plugin.settings.defaultWorkoutFolder
    );
    this.workout = { ...workout }; // Create a copy to avoid mutating original
    this.file = file;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl);

    renderHeader(contentEl, {
      title: "Edit workout",
      subtitle: this.file.basename,
    });

    new Setting(contentEl).setName("Workout name").addText((text) =>
      text
        .setPlaceholder("e.g. morning run, push day")
        .setValue(this.workout.name)
        .onChange((value) => {
          this.workout.name = value;
        })
    );

    new Setting(contentEl).setName("Date").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.workout.date).onChange((value) => {
        this.workout.date = value;
      });
    });

    new Setting(contentEl).setName("Duration (min)").addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text
        .setPlaceholder("60")
        .setValue(this.workout.duration?.toString() || "")
        .onChange((value) => {
          this.workout.duration = value ? parseInt(value) : undefined;
        });
    });

    createSectionLabel(contentEl, "Exercises");
    const exerciseContainer = contentEl.createDiv();
    this.renderExercises(exerciseContainer);

    new Setting(contentEl)
      .setName("Notes")
      .setDesc("Additional notes about this workout")
      .addTextArea((text) =>
        text
          .setPlaceholder("How did the workout feel? Any observations?")
          .setValue(this.workout.notes || "")
          .onChange((value) => {
            this.workout.notes = value;
          })
      );

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: "Save changes",
      variant: "primary",
      onClick: () => {
        void (async () => {
          if (this.workout.name && this.workout.exercises.length > 0) {
            const success = await this.fileService.updateWorkout(
              this.file,
              this.workout
            );
            if (success) this.close();
          } else {
            new Notice(
              "Please enter a workout name and add at least one exercise"
            );
          }
        })();
      },
    });
    createButton(actions, {
      label: "Cancel",
      variant: "quiet",
      onClick: () => this.close(),
    });
  }

  renderExercises(container: HTMLElement) {
    container.empty();

    if (this.workout.exercises.length === 0) {
      createHint(container, "No exercises yet.");
    } else {
      const list = createList(container);
      this.workout.exercises.forEach((exercise, index) => {
        const meta = [
          `${exercise.sets.length} set${exercise.sets.length === 1 ? "" : "s"}`,
          exercise.notes,
        ]
          .filter(Boolean)
          .join(" · ");

        const { actions } = createRow(list, { title: exercise.name, meta });

        createIconButton(actions, "pencil", "Edit exercise", () => {
          new ExerciseModal(
            this.app,
            this.plugin,
            (updatedExercise) => {
              this.workout.exercises[index] = updatedExercise;
              this.renderExercises(container);
            },
            exercise
          ).open();
        });
        createIconButton(
          actions,
          "trash-2",
          "Remove exercise",
          () => {
            this.workout.exercises.splice(index, 1);
            this.renderExercises(container);
          },
          { danger: true }
        );
      });
    }

    createButton(container, {
      label: "Add exercise",
      variant: "ghost",
      icon: "plus",
      onClick: () => {
        new ExerciseModal(this.app, this.plugin, (exercise) => {
          this.workout.exercises.push(exercise);
          this.renderExercises(container);
        }).open();
      },
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
