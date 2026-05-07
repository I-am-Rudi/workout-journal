import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { Workout } from "../types";
import { WorkoutFileService } from "../utils/workoutFileService";
import { ExerciseModal } from "./ExerciseModal";
import WorkoutTrackerPlugin from "../plugin";

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

    contentEl.createEl("h2", { text: "Edit Workout" });

    // Workout name input
    new Setting(contentEl)
      .setName("Workout Name")
      .setDesc("Enter a name for this workout")
      .addText((text) =>
        text
          .setPlaceholder("e.g., Morning Run, Push Day")
          .setValue(this.workout.name)
          .onChange(async (value) => {
            this.workout.name = value;
          })
      );

    // Date input
    new Setting(contentEl)
      .setName("Date")
      .setDesc("Workout date")
      .addText((text) =>
        text.setValue(this.workout.date).onChange(async (value) => {
          this.workout.date = value;
        })
      );

    // Duration input
    new Setting(contentEl)
      .setName("Duration (minutes)")
      .setDesc("Workout duration in minutes")
      .addText((text) =>
        text
          .setPlaceholder("60")
          .setValue(this.workout.duration?.toString() || "")
          .onChange(async (value) => {
            this.workout.duration = value ? parseInt(value) : undefined;
          })
      );

    // Exercise section
    const exerciseContainer = contentEl.createDiv();
    this.renderExercises(exerciseContainer);

    // Add exercise button
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Add Exercise")
        .setCta()
        .onClick(() => {
          new ExerciseModal(this.app, this.plugin, (exercise) => {
            this.workout.exercises.push(exercise);
            this.renderExercises(exerciseContainer);
          }).open();
        })
    );

    // Notes section
    new Setting(contentEl)
      .setName("Notes")
      .setDesc("Additional notes about this workout")
      .addTextArea((text) =>
        text
          .setPlaceholder("How did the workout feel? Any observations?")
          .setValue(this.workout.notes || "")
          .onChange(async (value) => {
            this.workout.notes = value;
          })
      );

    // Action buttons
    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.marginTop = "20px";

    new Setting(buttonContainer)
      .addButton((btn) =>
        btn
          .setButtonText("Save Changes")
          .setCta()
          .onClick(async () => {
            if (this.workout.name && this.workout.exercises.length > 0) {
              const success = await this.fileService.updateWorkout(
                this.file,
                this.workout
              );
              if (success) {
                this.close();
              }
            } else {
              new Notice(
                "Please enter a workout name and add at least one exercise"
              );
            }
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      );
  }

  renderExercises(container: HTMLElement) {
    container.empty();

    container.createEl("h3", { text: "Exercises" });

    if (this.workout.exercises.length === 0) {
      container.createEl("p", { text: "No exercises added yet." });
      return;
    }

    this.workout.exercises.forEach((exercise, index) => {
      const exerciseEl = container.createEl("div", {
        cls: "workout-exercise-item",
      });

      const nameEl = exerciseEl.createEl("div");
      nameEl.createEl("strong", { text: exercise.name });
      nameEl.createEl("span", { text: ` (${exercise.sets.length} sets)` });

      if (exercise.notes) {
        nameEl.createEl("br");
        nameEl.createEl("small", {
          text: exercise.notes,
          cls: "exercise-notes",
        });
      }

      const buttonContainer = exerciseEl.createEl("div");

      const editBtn = buttonContainer.createEl("button", {
        text: "Edit",
        cls: "mod-cta",
      });
      editBtn.style.marginRight = "8px";
      editBtn.onclick = () => {
        new ExerciseModal(
          this.app,
          this.plugin,
          (updatedExercise) => {
            this.workout.exercises[index] = updatedExercise;
            this.renderExercises(container);
          },
          exercise
        ).open();
      };

      const removeBtn = buttonContainer.createEl("button", {
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
