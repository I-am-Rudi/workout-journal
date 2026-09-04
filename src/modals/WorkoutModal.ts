import { App, Modal, Notice, Setting } from "obsidian";
import { Workout } from "../types";
import WorkoutTrackerPlugin from "../plugin";
import { ExerciseModal } from "./ExerciseModal";
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

export class WorkoutModal extends Modal {
  plugin: WorkoutTrackerPlugin;
  workout: Workout;

  constructor(app: App, plugin: WorkoutTrackerPlugin) {
    super(app);
    this.plugin = plugin;
    this.workout = {
      id: Date.now().toString(),
      date: new Date().toISOString().split("T")[0],
      name: "",
      exercises: [],
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl);

    renderHeader(contentEl, {
      title: "Log a workout",
      subtitle: "Write a finished workout straight to a note",
    });

    new Setting(contentEl)
      .setName("Workout name")
      .addText((text) =>
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

    createSectionLabel(contentEl, "Exercises");
    const exerciseContainer = contentEl.createDiv();
    this.renderExercises(exerciseContainer);

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: "Save workout",
      variant: "primary",
      onClick: () => {
        void (async () => {
          if (this.workout.name && this.workout.exercises.length > 0) {
            await this.plugin.createWorkoutFile(this.workout);
            this.close();
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
        const { actions } = createRow(list, {
          title: exercise.name,
          meta: `${exercise.sets.length} set${exercise.sets.length === 1 ? "" : "s"}`,
        });
        createIconButton(actions, "pencil", "Edit exercise", () => {
          new ExerciseModal(
            this.app,
            this.plugin,
            (updated) => {
              this.workout.exercises[index] = updated;
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
