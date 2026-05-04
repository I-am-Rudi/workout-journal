import { ItemView, Notice, Platform, Setting, WorkspaceLeaf } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { SessionFinishOptions, WorkoutSession, WorkoutSessionExercise, WorkoutSessionSet } from "../types";
import { AddSessionExerciseModal } from "../modals/AddSessionExerciseModal";

export const WORKOUT_SESSION_VIEW_TYPE = "workout-tracker-session-view";

export class WorkoutSessionView extends ItemView {
  plugin: WorkoutTrackerPlugin;
  session: WorkoutSession | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WorkoutTrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return WORKOUT_SESSION_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Workout Session";
  }

  async onOpen() {
    this.session = this.plugin.activeSession;
    this.render();
  }

  async onClose() {
    this.contentEl.empty();
  }

  setSession(session: WorkoutSession) {
    this.session = session;
    this.render();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("workout-session-view");

    if (!this.session) {
      contentEl.createEl("p", { text: "No active workout session." });
      return;
    }

    contentEl.createEl("h2", { text: this.session.name });
    const meta = contentEl.createEl("p", { cls: "workout-session-meta" });
    meta.setText(
      `${this.session.date}${
        this.session.routineName ? ` • Routine: ${this.session.routineName}` : ""
      }${this.session.planName ? ` • Plan: ${this.session.planName}` : ""}`
    );

    this.session.exercises.forEach((exercise, exerciseIndex) => {
      const card = contentEl.createDiv({ cls: "workout-session-card" });

      // Exercise header with name and management controls
      const cardHeader = card.createDiv({ cls: "workout-session-card-header" });
      cardHeader.createEl("h3", { text: exercise.exerciseName });

      const exerciseControls = cardHeader.createDiv({ cls: "workout-session-exercise-controls" });

      // Move Up button
      const moveUpBtn = exerciseControls.createEl("button", {
        text: "↑",
        cls: "workout-session-exercise-move",
        title: "Move exercise up",
      });
      moveUpBtn.disabled = exerciseIndex === 0;
      moveUpBtn.onclick = () => {
        if (exerciseIndex === 0) return;
        const exercises = this.session!.exercises;
        [exercises[exerciseIndex - 1], exercises[exerciseIndex]] = [
          exercises[exerciseIndex],
          exercises[exerciseIndex - 1],
        ];
        this.session!.hasRoutineChanges = true;
        this.render();
      };

      // Move Down button
      const moveDownBtn = exerciseControls.createEl("button", {
        text: "↓",
        cls: "workout-session-exercise-move",
        title: "Move exercise down",
      });
      moveDownBtn.disabled = exerciseIndex === this.session.exercises.length - 1;
      moveDownBtn.onclick = () => {
        const exercises = this.session!.exercises;
        if (exerciseIndex >= exercises.length - 1) return;
        [exercises[exerciseIndex], exercises[exerciseIndex + 1]] = [
          exercises[exerciseIndex + 1],
          exercises[exerciseIndex],
        ];
        this.session!.hasRoutineChanges = true;
        this.render();
      };

      // Remove Exercise button
      const removeExerciseBtn = exerciseControls.createEl("button", {
        text: "✕",
        cls: "workout-session-remove-exercise",
        title: "Remove exercise",
      });
      removeExerciseBtn.onclick = () => {
        this.session!.exercises.splice(exerciseIndex, 1);
        this.session!.hasRoutineChanges = true;
        this.render();
      };

      // Exercise-level notes (global, from the exercise definition) – read-only
      if (exercise.exerciseNotes) {
        const noteBlock = card.createDiv({ cls: "workout-session-exercise-notes" });
        noteBlock.createEl("span", {
          text: "📝 Exercise Note: ",
          cls: "workout-session-exercise-notes-label",
        });
        noteBlock.createEl("span", { text: exercise.exerciseNotes });
      }

      if (Platform.isMobile) {
        const setsWrapper = card.createDiv({ cls: "workout-session-sets-mobile" });
        exercise.sets.forEach((set, index) => {
          this.renderSetCard(setsWrapper, set, index, exercise, () => this.render());
        });
      } else {
        const tableWrapper = card.createDiv({ cls: "workout-session-table-wrapper" });
        const table = tableWrapper.createEl("table", { cls: "workout-session-table" });
        const header = table.createEl("tr");
        ["Set", "Prev", "Target", "Actual", "Done", ""].forEach((label) => {
          header.createEl("th", { text: label });
        });

        exercise.sets.forEach((set, index) => {
          const row = table.createEl("tr", {
            cls: set.completed ? "workout-session-row-completed" : "",
          });

          row.createEl("td", { text: String(set.setIndex) });
          row.createEl("td", {
            text:
              set.previousWeight !== undefined || set.previousReps !== undefined
                ? `${set.previousWeight ?? "-"} × ${set.previousReps ?? "-"}`
                : "-",
          });

          const targetCell = row.createEl("td");
          this.renderSetEditor(targetCell, set.targetWeight, set.targetReps, (weight, reps) => {
            set.targetWeight = weight;
            set.targetReps = reps;
            this.session!.hasRoutineChanges = true;
          });

          const actualCell = row.createEl("td");
          this.renderSetEditor(actualCell, set.actualWeight, set.actualReps, (weight, reps) => {
            set.actualWeight = weight;
            set.actualReps = reps;
          });

          const doneCell = row.createEl("td");
          const done = doneCell.createEl("input", { type: "checkbox" });
          done.checked = set.completed;
          done.onchange = () => {
            set.completed = done.checked;
            exercise.completed = exercise.sets.every((exerciseSet) => exerciseSet.completed);
            row.toggleClass("workout-session-row-completed", set.completed);
          };

          const removeCell = row.createEl("td");
          const removeBtn = removeCell.createEl("button", { text: "✕", cls: "workout-session-remove-set" });
          removeBtn.onclick = () => {
            exercise.sets.splice(index, 1);
            exercise.sets.forEach((s, i) => { s.setIndex = i + 1; });
            this.session!.hasRoutineChanges = true;
            this.render();
          };
        });
      }

      new Setting(card).addButton((btn) =>
        btn.setButtonText("Add Set").onClick(() => {
          exercise.sets.push({
            setIndex: exercise.sets.length + 1,
            completed: false,
            targetReps:
              exercise.sets.length > 0
                ? exercise.sets[exercise.sets.length - 1].targetReps
                : undefined,
            targetWeight:
              exercise.sets.length > 0
                ? exercise.sets[exercise.sets.length - 1].targetWeight
                : undefined,
            actualReps:
              exercise.sets.length > 0
                ? exercise.sets[exercise.sets.length - 1].actualReps ??
                  exercise.sets[exercise.sets.length - 1].targetReps
                : undefined,
            actualWeight:
              exercise.sets.length > 0
                ? exercise.sets[exercise.sets.length - 1].actualWeight ??
                  exercise.sets[exercise.sets.length - 1].targetWeight
                : undefined,
          });
          this.session!.hasRoutineChanges = true;
          this.render();
        })
      );

      // Routine-specific exercise notes (editable)
      new Setting(card)
        .setName("Routine Notes")
        .setClass("workout-session-routine-notes-setting")
        .addTextArea((text) =>
          text
            .setPlaceholder("Notes for this exercise in this routine…")
            .setValue(exercise.notes || "")
            .onChange((value) => {
              exercise.notes = value || undefined;
              this.session!.hasRoutineChanges = true;
            })
        );
    });

    // Add Exercise button
    new Setting(contentEl)
      .setName("Exercises")
      .addButton((btn) =>
        btn.setButtonText("Add Exercise").onClick(async () => {
          const exercises = await this.plugin.definitionService.loadExerciseDefinitions();
          new AddSessionExerciseModal(this.app, this.plugin, exercises, (newExercise) => {
            this.session!.exercises.push(newExercise);
            this.session!.hasRoutineChanges = true;
            this.render();
          }).open();
        })
      );

    new Setting(contentEl)
      .setName("Workout Notes")
      .addTextArea((text) =>
        text.setValue(this.session.notes || "").onChange((value) => {
          this.session!.notes = value;
        })
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Finish Workout")
          .setCta()
          .onClick(async () => {
            await this.plugin.finishActiveSessionFromView();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel Session").setWarning().onClick(() => {
          this.plugin.activeSession = null;
          this.render();
          new Notice("Workout session cancelled.");
        })
      );
  }

  private renderSetCard(
    container: HTMLElement,
    set: WorkoutSessionSet,
    index: number,
    exercise: WorkoutSessionExercise,
    onRerender: () => void
  ) {
    const card = container.createDiv({
      cls: `workout-session-set-card${set.completed ? " workout-session-row-completed" : ""}`,
    });

    // Header row: set number | target | done checkbox + remove button
    const header = card.createDiv({ cls: "workout-session-set-card-header" });
    header.createEl("span", { text: `Set ${set.setIndex}`, cls: "workout-session-set-card-set-num" });

    const targetText = `${set.targetWeight ?? "0"} × ${set.targetReps ?? "0"}`;
    header.createEl("span", { text: targetText, cls: "workout-session-set-card-target" });

    this.renderSetEditor(header, set.actualWeight, set.actualReps, (weight, reps) => {
      set.actualWeight = weight;
      set.actualReps = reps;
    });

    const headerRight = header.createDiv({ cls: "workout-session-set-card-header-right" });
    const done = headerRight.createEl("input", { type: "checkbox" });
    done.checked = set.completed;
    done.onchange = () => {
      set.completed = done.checked;
      exercise.completed = exercise.sets.every((s) => s.completed);
      card.toggleClass("workout-session-row-completed", set.completed);
    };

    const removeBtn = headerRight.createEl("button", { text: "✕", cls: "workout-session-remove-set" });
    removeBtn.onclick = () => {
      exercise.sets.splice(index, 1);
      exercise.sets.forEach((s, i) => { s.setIndex = i + 1; });
      this.session!.hasRoutineChanges = true;
      onRerender();
    };
  }

  private renderSetEditor(
    container: HTMLElement,
    weight: number | undefined,
    reps: number | undefined,
    onChange: (weight: number | undefined, reps: number | undefined) => void
  ) {
    const wrapper = container.createDiv({ cls: "workout-session-set-editor" });
    const weightInput = wrapper.createEl("input", {
      type: "number",
      placeholder: "Weight",
    });
    weightInput.value = weight !== undefined ? String(weight) : "";

    const repsInput = wrapper.createEl("input", {
      type: "number",
      placeholder: "Reps",
    });
    repsInput.value = reps !== undefined ? String(reps) : "";

    const update = () => {
      const nextWeight = weightInput.value ? parseFloat(weightInput.value) : undefined;
      const nextReps = repsInput.value ? parseInt(repsInput.value) : undefined;
      onChange(nextWeight, nextReps);
    };

    weightInput.oninput = update;
    weightInput.onchange = update;
    repsInput.oninput = update;
    repsInput.onchange = update;
  }

  async finishWithOptions(options: SessionFinishOptions): Promise<void> {
    await this.plugin.finishActiveSession(options);
  }
}
