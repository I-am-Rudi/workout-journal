import { ItemView, Notice, Platform, Setting, WorkspaceLeaf } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { SessionFinishOptions, SetType, WorkoutSession, WorkoutSessionExercise, WorkoutSessionSet } from "../types";
import { AddSessionExerciseModal } from "../modals/AddSessionExerciseModal";
import { ExerciseNoteModal } from "../modals/ExerciseNoteModal";
import { ConfirmModal } from "../modals/ConfirmModal";

export const WORKOUT_SESSION_VIEW_TYPE = "workout-tracker-session-view";

export class WorkoutSessionView extends ItemView {
  plugin: WorkoutTrackerPlugin;
  session: WorkoutSession | null = null;
  private timerIntervals: Map<number, ReturnType<typeof setInterval>> = new Map();
  private timerRemaining: Map<number, number> = new Map();
  private feedbackAudioContext: AudioContext | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WorkoutTrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return WORKOUT_SESSION_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Workout session";
  }

  async onOpen(): Promise<void> {
    this.session = this.plugin.activeSession;
    this.render();
  }

  async onClose(): Promise<void> {
    this.timerIntervals.forEach((intervalId) => clearInterval(intervalId));
    this.timerIntervals.clear();
    if (this.feedbackAudioContext) {
      void this.feedbackAudioContext.close();
      this.feedbackAudioContext = null;
    }
    this.contentEl.empty();
  }

  setSession(session: WorkoutSession) {
    this.session = session;
    this.render();
  }

  private getSetDisplayLabel(sets: WorkoutSessionSet[], currentIndex: number): string {
    const current = sets[currentIndex];
    const isDefault = !current.setType || current.setType === "default";
    if (isDefault) {
      let count = 0;
      for (let i = 0; i <= currentIndex; i++) {
        if (!sets[i].setType || sets[i].setType === "default") count++;
      }
      return String(count);
    }
    return current.setType[0].toUpperCase();
  }

  private nextSetType(current: SetType | undefined): SetType {
    switch (current) {
      case "warmup": return "dropset";
      case "dropset": return "myoreps";
      case "myoreps": return "default";
      default: return "warmup";
    }
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
    const session = this.session;

    const titleEl = contentEl.createDiv({
      text: this.session.name,
      cls: "workout-session-title",
    });
    titleEl.setAttr("role", "heading");
    titleEl.setAttr("aria-level", "2");
    const meta = contentEl.createEl("p", { cls: "workout-session-meta" });
    meta.setText(
      `${this.session.date}${
        this.session.routineName ? ` • Routine: ${this.session.routineName}` : ""
      }${this.session.planName ? ` • Plan: ${this.session.planName}` : ""}`
    );

    session.exercises.forEach((exercise, exerciseIndex) => {
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
          new ExerciseNoteModal(this.app, exercise.exerciseFilePath, exercise.exerciseName).open();
        };
      } else {
        const exerciseNameEl = cardHeader.createDiv({
          text: exercise.exerciseName,
          cls: "workout-session-exercise-name",
        });
        exerciseNameEl.setAttr("role", "heading");
        exerciseNameEl.setAttr("aria-level", "3");
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
        const exercises = session.exercises;
        [exercises[exerciseIndex - 1], exercises[exerciseIndex]] = [
          exercises[exerciseIndex],
          exercises[exerciseIndex - 1],
        ];
        session.hasRoutineChanges = true;
        this.render();
      };

      // Move Down button
      const moveDownBtn = exerciseControls.createEl("button", {
        text: "↓",
        cls: "workout-session-exercise-move",
        title: "Move exercise down",
      });
      moveDownBtn.disabled = exerciseIndex === session.exercises.length - 1;
      moveDownBtn.onclick = () => {
        const exercises = session.exercises;
        if (exerciseIndex >= exercises.length - 1) return;
        [exercises[exerciseIndex], exercises[exerciseIndex + 1]] = [
          exercises[exerciseIndex + 1],
          exercises[exerciseIndex],
        ];
        session.hasRoutineChanges = true;
        this.render();
      };

      // Remove Exercise button
      const removeExerciseBtn = exerciseControls.createEl("button", {
        text: "✕",
        cls: "workout-session-remove-exercise",
        title: "Remove exercise",
      });
      removeExerciseBtn.onclick = () => {
        session.exercises.splice(exerciseIndex, 1);
        session.hasRoutineChanges = true;
        this.render();
      };

      // Inline timer editor (shown when timer button is clicked)
      const timerEditor = card.createDiv({ cls: "workout-session-timer-editor" });
      timerEditor.hide();
      let isTimerEditorOpen = false;
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
        timerEditor.hide();
        isTimerEditorOpen = false;
      };
      timerSaveBtn.onclick = saveTimer;
      timerCancelBtn.onclick = () => {
        timerEditor.hide();
        isTimerEditorOpen = false;
      };
      timerInput.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key === "Enter") saveTimer();
        if (ev.key === "Escape") {
          timerEditor.hide();
          isTimerEditorOpen = false;
        }
      });

      timerBtn.onclick = () => {
        if (!isTimerEditorOpen) {
          timerInput.value = String(
            exercise.restTimerSeconds !== undefined
              ? exercise.restTimerSeconds
              : this.plugin.settings.defaultRestTimerSeconds
          );
          timerEditor.show();
          isTimerEditorOpen = true;
          timerInput.focus();
          timerInput.select();
        } else {
          timerEditor.hide();
          isTimerEditorOpen = false;
        }
      };

      // Timer countdown display (shown while a rest timer is running)
      const timerDisplay = card.createDiv({ cls: "workout-session-timer-display" });
      timerDisplay.hide();
      timerDisplay.title = "Click to stop timer";
      timerDisplay.addEventListener("click", () => {
        this.stopRestTimer(exerciseIndex, timerDisplay);
      });

      // Routine-specific exercise notes shown inline in the active session
      const routineNoteBanner = card.createDiv({ cls: "workout-session-routine-note-banner" });
      routineNoteBanner.createSpan({ text: "📝", cls: "workout-session-routine-note-icon" });
      const routineNoteInput = routineNoteBanner.createEl("textarea", {
        cls: "workout-session-routine-note-input",
      });
      routineNoteInput.rows = 1;
      routineNoteInput.value = exercise.notes || "";
      routineNoteInput.placeholder = "Add routine note…";

      const resizeRoutineNoteInput = () => {
        routineNoteInput.style.height = "auto";
        routineNoteInput.style.height = `${routineNoteInput.scrollHeight}px`;
      };
      resizeRoutineNoteInput();

      routineNoteInput.addEventListener("input", () => {
        resizeRoutineNoteInput();
        exercise.notes = routineNoteInput.value || undefined;
        session.hasRoutineChanges = true;
      });

      // Exercise-level notes (global, from the exercise definition) – read-only
      if (exercise.exerciseNotes) {
        const noteBlock = card.createDiv({ cls: "workout-session-exercise-notes" });
        noteBlock.createEl("span", {
          text: "📝 Exercise note: ",
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

          const setTypeCell = row.createEl("td");
          const setType = set.setType || "default";
          const setTypeBtn = setTypeCell.createEl("button", {
            text: this.getSetDisplayLabel(exercise.sets, index),
            cls: `workout-session-set-type-btn workout-session-set-type-${setType}`,
            title: "Click to change set type",
          });
          setTypeBtn.onclick = () => {
            set.setType = this.nextSetType(set.setType);
            session.hasRoutineChanges = true;
            this.render();
          };
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
            session.hasRoutineChanges = true;
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
              this.triggerSetCompletionFeedback();
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
            session.hasRoutineChanges = true;
            this.render();
          };
        });
      }

      new Setting(card).addButton((btn) =>
        btn.setButtonText("Add set").onClick(() => {
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
          session.hasRoutineChanges = true;
          this.render();
        })
      );

    });

    // Add Exercise button
    new Setting(contentEl)
      .setName("Exercises")
      .addButton((btn) =>
        btn.setButtonText("Add exercise").onClick(() => {
          void (async () => {
            const exercises = await this.plugin.definitionService.loadExerciseDefinitions();
            new AddSessionExerciseModal(this.app, this.plugin, exercises, (newExercise) => {
              session.exercises.push(newExercise);
              session.hasRoutineChanges = true;
              this.render();
            }, this.plugin.performanceCsvService, session.routineId).open();
          })();
        })
      );

    new Setting(contentEl)
      .setName("Workout notes")
      .addTextArea((text) =>
        text.setValue(session.notes || "").onChange((value) => {
          session.notes = value;
        })
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Finish workout")
          .setCta()
          .onClick(() => {
            this.plugin.finishActiveSessionFromView();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel session").setWarning().onClick(() => {
          new ConfirmModal(
            this.plugin.app,
            "Are you sure you want to cancel this session? All progress will be lost.",
            () => {
              void this.plugin.cancelActiveSession();
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
    const setType = set.setType || "default";
    const isDefault = setType === "default";
    const displayLabel = this.getSetDisplayLabel(exercise.sets, index);
    const setTypeBtnMobile = header.createEl("button", {
      text: isDefault ? `Set ${displayLabel}` : displayLabel,
      cls: `workout-session-set-card-set-num workout-session-set-type-btn workout-session-set-type-${setType}`,
      title: "Click to change set type",
    });
    setTypeBtnMobile.onclick = () => {
      set.setType = this.nextSetType(set.setType);
      if (this.session) {
        this.session.hasRoutineChanges = true;
      }
      onRerender();
    };

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
        this.triggerSetCompletionFeedback();
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
      if (this.session) {
        this.session.hasRoutineChanges = true;
      }
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
        display.hide();
        display.textContent = "";
        this.triggerRestTimerCompletionFeedback();
        new Notice("🏋️ Rest complete! Time for the next set.");
        return;
      }
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      display.show();
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
    display.hide();
    display.textContent = "";
  }

  private triggerSetCompletionFeedback(): void {
    this.triggerFeedback(
      this.plugin.settings.enableSetCompletionVibrationFeedback,
      this.plugin.settings.enableSetCompletionSoundFeedback,
      [90],
      880,
      0.08,
      0.08
    );
  }

  private triggerRestTimerCompletionFeedback(): void {
    this.triggerFeedback(
      this.plugin.settings.enableRestTimerVibrationFeedback,
      this.plugin.settings.enableRestTimerSoundFeedback,
      [260, 100, 260],
      880,
      0.08,
      0.14
    );
  }

  private triggerFeedback(
    vibrateEnabled: boolean,
    soundEnabled: boolean,
    vibrationPattern: number | number[],
    frequency: number,
    gainPeak: number,
    durationSeconds: number
  ): void {
    if (
      vibrateEnabled &&
      Platform.isMobile &&
      typeof navigator !== "undefined" &&
      "vibrate" in navigator
    ) {
      navigator.vibrate(vibrationPattern);
    }

    if (!soundEnabled || typeof window === "undefined") {
      return;
    }

    try {
      const AudioContextClass: typeof AudioContext | undefined = window.AudioContext;
      if (!AudioContextClass) {
        return;
      }
      if (!this.feedbackAudioContext || this.feedbackAudioContext.state === "closed") {
        this.feedbackAudioContext = new AudioContextClass();
      }
      const audioContext = this.feedbackAudioContext;
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const minGainValue = 0.0001;
      const attackTimeSeconds = 0.01;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gainNode.gain.setValueAtTime(minGainValue, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        gainPeak,
        audioContext.currentTime + attackTimeSeconds
      );
      gainNode.gain.exponentialRampToValueAtTime(
        minGainValue,
        audioContext.currentTime + durationSeconds
      );
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + durationSeconds);
    } catch {
      // no-op: feedback is best-effort only
    }
  }

  async finishWithOptions(options: SessionFinishOptions): Promise<void> {
    await this.plugin.finishActiveSession(options);
  }
}
