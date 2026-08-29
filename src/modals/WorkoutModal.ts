import { App, Modal, Notice, Setting } from "obsidian";
import { Workout } from "../types";
import WorkoutTrackerPlugin from "../plugin";
import { ExerciseModal } from "./ExerciseModal";

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

    contentEl.createEl("h2", { text: "Log new workout" });

    // Workout name input
    new Setting(contentEl)
      .setName("Workout name")
      .setDesc("Enter a name for this workout")
      .addText((text) =>
        text
          .setPlaceholder("e.g., morning run, push day")
          .setValue(this.workout.name)
          .onChange((value) => {
            this.workout.name = value;
          })
      );

    // Date input
    new Setting(contentEl)
      .setName("Date")
      .setDesc("Workout date")
      .addText((text) =>
        text.setValue(this.workout.date).onChange((value) => {
          this.workout.date = value;
        })
      );

    // Exercise section
    const exerciseContainer = contentEl.createDiv();
    this.renderExercises(exerciseContainer);

    // Add exercise button
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Add exercise")
        .setCta()
        .onClick(() => {
          new ExerciseModal(this.app, this.plugin, (exercise) => {
            this.workout.exercises.push(exercise);
            this.renderExercises(exerciseContainer);
          }).open();
        })
    );

    // Save button
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save workout")
        .setCta()
        .onClick(async () => {
          if (this.workout.name && this.workout.exercises.length > 0) {
            await this.plugin.createWorkoutFile(this.workout);
            this.close();
          } else {
            new Notice(
              "Please enter a workout name and add at least one exercise"
            );
          }
        })
    );
  }

  renderExercises(container: HTMLElement) {
    container.empty();
    if (this.workout.exercises.length === 0) {
      container.createEl("p", { text: "No exercises added yet." });
      return;
    }

    const exerciseList = container.createDiv();
    exerciseList.createEl("h3", { text: "Exercises:" });

    this.workout.exercises.forEach((exercise, index) => {
      const exerciseEl = exerciseList.createDiv({
        cls: "workout-exercise-item",
      });
      exerciseEl.createEl("strong", { text: exercise.name });
      exerciseEl.createSpan({ text: ` (${exercise.sets.length} sets)` });

      const removeBtn = exerciseEl.createEl("button", {
        text: "Remove",
        cls: "mod-warning",
      });
      removeBtn.onclick = () => {
        this.workout.exercises.splice(index, 1);
        this.renderExercises(container);
      };
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
