import { ItemView, Notice, Platform, Setting, WorkspaceLeaf } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { SessionFinishOptions, WorkoutSession, WorkoutSessionExercise, WorkoutSessionSet } from "../types";
import { AddSessionExerciseModal } from "../modals/AddSessionExerciseModal";
import { ExerciseNoteModal } from "../modals/ExerciseNoteModal";
import { ConfirmModal } from "../modals/ConfirmModal";

export const WORKOUT_SESSION_VIEW_TYPE = "workout-tracker-session-view";

export class WorkoutSessionView extends ItemView {
  plugin: WorkoutTrackerPlugin;
  session: WorkoutSession | null = null;
  private timerIntervals: Map<number, ReturnType<typeof setInterval>> = new Map();
  private timerRemaining: Map<number, number> = new Map();

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
    this.timerIntervals.forEach((intervalId) => clearInterval(intervalId));
    this.timerIntervals.clear();
    this.contentEl.empty();
  }

  setSession(session: WorkoutSession) {
    this.session = session;
    this.render();
  }

  private render() {
    // Stop all running timers before rebuilding the DOM
    this.timerIntervals.forEach((id) => clearInterval(id));
    this.timerIntervals.clear();
    this.timerRemaining.clear();

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

      if (exercise.exerciseFilePath) {
        const nameBtn = cardHeader.createEl("button", {
          text: exercise.exerciseName,
          cls: "workout-session-exercise-name-btn",
          title: "View / edit exercise note",
        });
        nameBtn.onclick = () => {
          new ExerciseNoteModal(this.app, exercise.exerciseFilePath!, exercise.exerciseName).open();
        };
      } else {
        cardHeader.createEl("h3", { text: exercise.exerciseName });
      }

      // Timer button – shows current duration and toggles the inline editor
      const timerDuration = exercise.restTimerSeconds !== undefined
        ? exercise.restTimerSeconds
        : this.plugin.settings.defaultRestTimerSeconds;
      const timerBtn = cardHeader.createEl("button", {
        text: `⏱ ${timerDuration}s`,
        cls: "workout-session-timer-btn",
        title: "Edit rest timer for this exercise",
      });

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

      // Inline timer editor (shown when timer button is clicked)
      const timerEditor = card.createDiv({ cls: "workout-session-timer-editor" });
      timerEditor.style.display = "none";
      timerEditor.createEl("label", { text: "Rest timer (s):", cls: "workout-session-timer-label" });
      const timerInput = timerEditor.createEl("input", {
        type: "number",
        cls: "workout-session-timer-input",
      });
      timerInput.min = "0";
      timerInput.max = "3600";
      timerInput.value = String(timerDuration);
      const timerSaveBtn = timerEditor.createEl("button", {
        text: "✓",
        cls: "workout-session-timer-ok",
        title: "Save",
      });
      const timerCancelBtn = timerEditor.createEl("button", {
        text: "✗",
        cls: "workout-session-timer-cancel",
        title: "Cancel",
      });

      const saveTimer = () => {
        const val = parseInt(timerInput.value);
        if (!isNaN(val) && val >= 0) {
          exercise.restTimerSeconds = val;
          timerBtn.textContent = `⏱ ${val}s`;
        }
        timerEditor.style.display = "none";
      };
      timerSaveBtn.onclick = saveTimer;
      timerCancelBtn.onclick = () => { timerEditor.style.display = "none"; };
      timerInput.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key === "Enter") saveTimer();
        if (ev.key === "Escape") timerEditor.style.display = "none";
      });

      timerBtn.onclick = () => {
        if (timerEditor.style.display === "none") {
          timerInput.value = String(
            exercise.restTimerSeconds !== undefined
              ? exercise.restTimerSeconds
              : this.plugin.settings.defaultRestTimerSeconds
          );
          timerEditor.style.display = "flex";
          timerInput.focus();
          timerInput.select();
        } else {
          timerEditor.style.display = "none";
        }
      };

      // Timer countdown display (shown while a rest timer is running)
      const timerDisplay = card.createDiv({ cls: "workout-session-timer-display" });
      timerDisplay.style.display = "none";
      timerDisplay.title = "Click to stop timer";
      timerDisplay.addEventListener("click", () => {
        this.stopRestTimer(exerciseIndex, timerDisplay);
      });

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
          this.renderSetCard(setsWrapper, set, index, exercise, exerciseIndex, timerDisplay, () => this.render());
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
            if (done.checked) {
              const dur = exercise.restTimerSeconds !== undefined
                ? exercise.restTimerSeconds
                : this.plugin.settings.defaultRestTimerSeconds;
              if (dur > 0) {
                this.startRestTimer(exerciseIndex, dur, timerDisplay);
              }
            } else {
              this.stopRestTimer(exerciseIndex, timerDisplay);
            }
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
          new ConfirmModal(
            this.plugin.app,
            "Are you sure you want to cancel this session? All progress will be lost.",
            async () => {
              await this.plugin.cancelActiveSession();
            }
          ).open();
        })
      );

    contentEl.createEl("div", { cls: "workout-session-bottom-spacer" });
  }

  private renderSetCard(
    container: HTMLElement,
    set: WorkoutSessionSet,
    index: number,
    exercise: WorkoutSessionExercise,
    exerciseIndex: number,
    timerDisplay: HTMLElement,
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
      if (done.checked) {
        const dur = exercise.restTimerSeconds !== undefined
          ? exercise.restTimerSeconds
          : this.plugin.settings.defaultRestTimerSeconds;
        if (dur > 0) {
          this.startRestTimer(exerciseIndex, dur, timerDisplay);
        }
      } else {
        this.stopRestTimer(exerciseIndex, timerDisplay);
      }
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

  private startRestTimer(exerciseIndex: number, duration: number, display: HTMLElement): void {
    // Stop any existing timer for this exercise first
    const existing = this.timerIntervals.get(exerciseIndex);
    if (existing !== undefined) {
      clearInterval(existing);
      this.timerIntervals.delete(exerciseIndex);
    }

    this.timerRemaining.set(exerciseIndex, duration);

    const tick = () => {
      const remaining = this.timerRemaining.get(exerciseIndex);
      if (remaining === undefined || remaining < 0) {
        clearInterval(this.timerIntervals.get(exerciseIndex));
        this.timerIntervals.delete(exerciseIndex);
        this.timerRemaining.delete(exerciseIndex);
        display.style.display = "none";
        display.textContent = "";
        new Notice("🏋️ Rest complete! Time for the next set.");
        return;
      }
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      display.style.display = "flex";
      display.textContent = `⏱ ${minutes}:${seconds.toString().padStart(2, "0")} — tap to stop`;
      this.timerRemaining.set(exerciseIndex, remaining - 1);
    };

    tick(); // Show the initial value immediately
    const intervalId = setInterval(tick, 1000);
    this.timerIntervals.set(exerciseIndex, intervalId);
  }

  private stopRestTimer(exerciseIndex: number, display: HTMLElement): void {
    const id = this.timerIntervals.get(exerciseIndex);
    if (id !== undefined) {
      clearInterval(id);
      this.timerIntervals.delete(exerciseIndex);
    }
    this.timerRemaining.delete(exerciseIndex);
    display.style.display = "none";
    display.textContent = "";
  }

  async finishWithOptions(options: SessionFinishOptions): Promise<void> {
    await this.plugin.finishActiveSession(options);
  }
}
