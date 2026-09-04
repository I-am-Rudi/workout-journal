import { ItemView, Notice, Platform, setIcon, WorkspaceLeaf } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { SessionFinishOptions, SetType, WorkoutSession, WorkoutSessionExercise, WorkoutSessionSet } from "../types";
import { AddSessionExerciseModal } from "../modals/AddSessionExerciseModal";
import { ExerciseNoteModal } from "../modals/ExerciseNoteModal";
import { ConfirmModal } from "../modals/ConfirmModal";
import { FeedbackPlayer } from "../utils/feedbackUtils";
import { isDurationOnly, isRepsOnly } from "../utils/exerciseTypeUtils";
import {
  formatElapsed,
  getSessionElapsedMs,
  hasSessionTimer,
  isSessionTimerRunning,
  pauseSessionTimer,
  resumeSessionTimer,
} from "../utils/sessionTimerUtils";
import { createEmptyState } from "../utils/uiKit";

export const WORKOUT_SESSION_VIEW_TYPE = "workout-tracker-session-view";

export class WorkoutSessionView extends ItemView {
  plugin: WorkoutTrackerPlugin;
  session: WorkoutSession | null = null;
  private timerIntervals: Map<number, number> = new Map();
  private timerEndTimes: Map<number, number> = new Map();
  private timerDisplays: Map<number, HTMLElement> = new Map();
  private feedback = new FeedbackPlayer();
  private visibilityHandler: (() => void) | null = null;
  /** Live workout clock: one ticker, redrawn from the session timestamps. */
  private elapsedIntervalId: number | null = null;
  private elapsedChipEl: HTMLElement | null = null;
  private elapsedIconEl: HTMLElement | null = null;
  private elapsedValueEl: HTMLElement | null = null;

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
    this.stopElapsedTicker();
    this.timerIntervals.forEach((intervalId) => window.clearInterval(intervalId));
    this.timerIntervals.clear();
    this.timerEndTimes.clear();
    this.timerDisplays.clear();
    if (this.visibilityHandler) {
      activeDocument.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.feedback.dispose();
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
    // Every re-render follows a session change; snapshot it so the state on
    // disk stays current even if the app is killed while in the background.
    this.plugin.persistActiveSession();

    // Stop intervals but keep timerEndTimes so live timers survive re-renders
    this.timerIntervals.forEach((id) => window.clearInterval(id));
    this.timerIntervals.clear();
    this.timerDisplays.clear();
    this.stopElapsedTicker();

    const { contentEl } = this;
    const previousScrollTop = contentEl.scrollTop;
    contentEl.empty();
    contentEl.addClass("workout-session-view");

    if (!this.session) {
      createEmptyState(contentEl, {
        title: "No active workout",
        body: "Start one from the workout journal ribbon icon.",
      });
      return;
    }
    const session = this.session;

    const header = contentEl.createDiv({ cls: "workout-session-header" });
    const headerText = header.createDiv({ cls: "workout-session-header-text" });
    const titleEl = headerText.createDiv({
      text: session.name,
      cls: "workout-session-title",
    });
    titleEl.setAttr("role", "heading");
    titleEl.setAttr("aria-level", "2");
    const meta = headerText.createDiv({ cls: "workout-session-meta" });
    meta.setText(
      `${session.date}${
        session.routineName ? ` · ${session.routineName}` : ""
      }${session.planName ? ` · ${session.planName}` : ""}`
    );

    // Routine editing is not a workout, so it carries no clock.
    if (!session.routineEditMode && hasSessionTimer(session)) {
      this.renderElapsedChip(header, session);
    }

    const cardEls: HTMLElement[] = [];

    session.exercises.forEach((exercise, exerciseIndex) => {
      const card = contentEl.createDiv({ cls: "workout-session-card" });
      cardEls.push(card);

      // Exercise header with name and management controls
      const cardHeader = card.createDiv({ cls: "workout-session-card-header" });

      // Drag handle
      const dragHandle = cardHeader.createDiv({
        cls: "workout-session-drag-handle",
        title: "Hold and drag to reorder",
      });
      dragHandle.textContent = "⠿";
      this.attachDragHandle(dragHandle, exerciseIndex, cardEls, session);

      if (exercise.exerciseFilePath) {
        const nameBtn = cardHeader.createEl("button", {
          text: exercise.exerciseName,
          cls: "workout-session-exercise-name-btn",
          title: "View / edit exercise note",
        });
        const notePath = exercise.exerciseFilePath;
        nameBtn.onclick = () => {
          new ExerciseNoteModal(
            this.app,
            this.plugin,
            notePath,
            exercise.exerciseName,
            (notes) => {
              // The session carries its own copy of the exercise note, taken
              // when it was built, and the banner reads that copy — so a save
              // has to write it back or the card keeps showing the old text.
              // Every card for the same note, in case it appears twice.
              session.exercises
                .filter((other) => other.exerciseFilePath === notePath)
                .forEach((other) => {
                  other.exerciseNotes = notes || undefined;
                });
              this.plugin.persistActiveSession();
              this.render();
            }
          ).open();
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
      // Circuits use the per-set pause instead of a rest timer.
      if (session.isCircle) {
        timerBtn.hide();
      }

      const exerciseControls = cardHeader.createDiv({ cls: "workout-session-exercise-controls" });

      // Replace exercise button
      const replaceExerciseBtn = exerciseControls.createEl("button", {
        text: "⇄",
        cls: "workout-session-replace-exercise",
        title: "Replace exercise",
      });
      replaceExerciseBtn.onclick = () => {
        void (async () => {
          const exercises = await this.plugin.definitionService.loadExerciseDefinitions();
          new AddSessionExerciseModal(
            this.app, this.plugin, exercises,
            (newExercise) => {
              session.exercises[exerciseIndex] = newExercise;
              session.hasRoutineChanges = true;
              this.render();
            },
            this.plugin.performanceCsvService, session.routineId,
            session.isCircle ? "duration-only" : undefined
          ).open();
        })();
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
      this.timerDisplays.set(exerciseIndex, timerDisplay);
      // Restore display if a timer is still running for this exercise after a re-render
      if (this.timerEndTimes.has(exerciseIndex)) {
        this.resumeTimerDisplay(exerciseIndex, timerDisplay);
      }

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
        routineNoteInput.addClass("workout-session-routine-note-input-sizing");
        const contentHeight = `${routineNoteInput.scrollHeight}px`;
        routineNoteInput.removeClass("workout-session-routine-note-input-sizing");
        routineNoteInput.setCssProps({
          "--workout-session-routine-note-height": contentHeight,
        });
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
        noteBlock.createSpan({
          text: "📝 Exercise note: ",
          cls: "workout-session-exercise-notes-label",
        });
        noteBlock.createSpan({
          text: exercise.exerciseNotes,
          cls: "workout-session-exercise-notes-content",
        });
      }

      const isCardio = exercise.exerciseType === "cardio";
      const durationOnly = isDurationOnly(exercise.exerciseType);
      const repsOnly = isRepsOnly(exercise.exerciseType);

      if (Platform.isMobile) {
        const setsWrapper = card.createDiv({ cls: "workout-session-sets-mobile" });
        exercise.sets.forEach((set, index) => {
          this.renderSetCard(setsWrapper, set, index, exercise, exerciseIndex, timerDisplay, () => this.render());
        });
      } else {
        const tableWrapper = card.createDiv({ cls: "workout-session-table-wrapper" });
        const table = tableWrapper.createEl("table", { cls: "workout-session-table" });
        const header = table.createEl("tr");
        const isRoutineEdit = !!session.routineEditMode;
        // duration-only sets carry a single time value, so target and actual
        // collapse into one editable column; circuit routines add the pause.
        const headerLabels = session.isCircle
          ? ["Set", "Work (s)", "Pause (s)", ""]
          : isRoutineEdit
            ? durationOnly
              ? ["Set", "Duration (s)", ""]
              : ["Set", "Target", ""]
            : durationOnly
              ? ["Set", "Duration (s)", "Done", ""]
              : ["Set", "Prev", "Target", "Actual", "Done", ""];
        headerLabels.forEach((label) => header.createEl("th", { text: label }));

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

          if (durationOnly) {
            const durationCell = row.createEl("td");
            this.renderDurationEditor(durationCell, set.duration, (duration) => {
              set.duration = duration;
              session.hasRoutineChanges = true;
            });

            if (session.isCircle) {
              const pauseCell = row.createEl("td");
              this.renderDurationEditor(pauseCell, set.restTime, (restTime) => {
                set.restTime = restTime;
                session.hasRoutineChanges = true;
              });
            }
          } else if (isCardio) {
            if (!isRoutineEdit) {
              row.createEl("td", {
                text:
                  set.duration !== undefined || set.distance !== undefined
                    ? `${set.duration ?? "-"}min / ${set.distance ?? "-"}${this.distanceUnit()}`
                    : "-",
              });
            }

            const targetCell = row.createEl("td");
            this.renderCardioEditor(targetCell, set.duration, set.distance, (duration, distance) => {
              set.duration = duration;
              set.distance = distance;
              session.hasRoutineChanges = true;
            });

            if (!isRoutineEdit) {
              const actualCell = row.createEl("td");
              this.renderCardioEditor(actualCell, set.duration, set.distance, (duration, distance) => {
                set.duration = duration;
                set.distance = distance;
              });
            }
          } else if (repsOnly) {
            if (!isRoutineEdit) {
              row.createEl("td", {
                text: set.previousReps !== undefined ? `${set.previousReps} reps` : "-",
              });
            }

            const targetCell = row.createEl("td");
            this.renderRepsEditor(targetCell, set.targetReps, (reps) => {
              set.targetReps = reps;
              session.hasRoutineChanges = true;
            });

            if (!isRoutineEdit) {
              const actualCell = row.createEl("td");
              this.renderRepsEditor(actualCell, set.actualReps, (reps) => {
                set.actualReps = reps;
              });
            }
          } else {
            if (!isRoutineEdit) {
              row.createEl("td", {
                text:
                  set.previousWeight !== undefined || set.previousReps !== undefined
                    ? `${set.previousWeight ?? "-"} × ${set.previousReps ?? "-"}`
                    : "-",
              });
            }

            const targetCell = row.createEl("td");
            this.renderSetEditor(targetCell, set.targetWeight, set.targetReps, (weight, reps) => {
              set.targetWeight = weight;
              set.targetReps = reps;
              session.hasRoutineChanges = true;
            });

            if (!isRoutineEdit) {
              const actualCell = row.createEl("td");
              this.renderSetEditor(actualCell, set.actualWeight, set.actualReps, (weight, reps) => {
                set.actualWeight = weight;
                set.actualReps = reps;
              });
            }
          }

          if (!isRoutineEdit) {
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
          }

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

      // A circuit exercise is a single work/pause pair, so extra sets are noise.
      if (!session.isCircle) {
        const addSetBtn = card.createEl("button", {
          text: "Add set",
          cls: "workout-session-add-set",
        });
        addSetBtn.onclick = () => {
          const lastSet = exercise.sets[exercise.sets.length - 1];
          exercise.sets.push({
            setIndex: exercise.sets.length + 1,
            completed: false,
            duration: durationOnly ? lastSet?.duration : undefined,
            targetReps: lastSet?.targetReps,
            targetWeight: lastSet?.targetWeight,
            actualReps: lastSet?.actualReps ?? lastSet?.targetReps,
            actualWeight: lastSet?.actualWeight ?? lastSet?.targetWeight,
          });
          session.hasRoutineChanges = true;
          this.render();
        };
      }

    });

    const addExerciseBtn = contentEl.createEl("button", {
      cls: "workout-session-add-exercise",
    });
    setIcon(addExerciseBtn.createSpan({ cls: "workout-session-btn-icon" }), "plus");
    addExerciseBtn.createSpan({ text: "Add exercise" });
    addExerciseBtn.onclick = () => {
      void (async () => {
        const exercises = await this.plugin.definitionService.loadExerciseDefinitions();
        new AddSessionExerciseModal(this.app, this.plugin, exercises, (newExercise) => {
          session.exercises.push(newExercise);
          session.hasRoutineChanges = true;
          this.render();
        }, this.plugin.performanceCsvService, session.routineId,
        session.isCircle ? "duration-only" : undefined).open();
      })();
    };

    const notesBlock = contentEl.createDiv({ cls: "workout-session-notes-block" });
    notesBlock.createDiv({
      text: session.routineEditMode ? "Routine notes" : "Workout notes",
      cls: "workout-session-section-label",
    });
    const notesArea = notesBlock.createEl("textarea", {
      cls: "workout-session-workout-notes",
    });
    notesArea.rows = 4;
    notesArea.value = session.notes || "";
    notesArea.placeholder = session.routineEditMode
      ? "Add routine notes…"
      : "Add workout notes…";
    notesArea.addEventListener("input", () => {
      session.notes = notesArea.value;
    });

    const actions = contentEl.createDiv({ cls: "workout-session-actions" });

    if (session.routineEditMode) {
      const saveBtn = actions.createEl("button", {
        text: "Save routine",
        cls: "workout-session-action workout-session-action-primary",
      });
      saveBtn.onclick = () => {
        void this.plugin.saveRoutineFromSession();
      };

      const discardBtn = actions.createEl("button", {
        text: "Discard changes",
        cls: "workout-session-action workout-session-action-danger",
      });
      discardBtn.onclick = () => {
        new ConfirmModal(
          this.plugin.app,
          "Discard all changes to this routine?",
          () => {
            void this.plugin.cancelActiveSession();
          }
        ).open();
      };

      contentEl.createDiv({ cls: "workout-session-bottom-spacer" });
      contentEl.scrollTo({ top: previousScrollTop });
      return;
    }

    const finishBtn = actions.createEl("button", {
      text: "Finish workout",
      cls: "workout-session-action workout-session-action-primary",
    });
    finishBtn.onclick = () => {
      this.plugin.finishActiveSessionFromView();
    };

    const cancelBtn = actions.createEl("button", {
      text: "Cancel session",
      cls: "workout-session-action workout-session-action-danger",
    });
    cancelBtn.onclick = () => {
      new ConfirmModal(
        this.plugin.app,
        "Are you sure you want to cancel this session? All progress will be lost.",
        () => {
          void this.plugin.cancelActiveSession();
        }
      ).open();
    };

    contentEl.createDiv({ cls: "workout-session-bottom-spacer" });
    contentEl.scrollTop = previousScrollTop;
  }

  /**
   * The workout clock. It reads the session timestamps on every tick rather
   * than counting, so pausing, a screen lock, or a reopened view all agree.
   */
  private renderElapsedChip(container: HTMLElement, session: WorkoutSession): void {
    const chip = container.createEl("button", {
      cls: "workout-session-elapsed",
      attr: { type: "button" },
    });
    this.elapsedChipEl = chip;
    this.elapsedIconEl = chip.createSpan({ cls: "workout-session-elapsed-icon" });
    this.elapsedValueEl = chip.createSpan({ cls: "workout-session-elapsed-value" });

    chip.onclick = () => {
      if (isSessionTimerRunning(session)) {
        pauseSessionTimer(session);
      } else {
        resumeSessionTimer(session);
      }
      this.plugin.persistActiveSession();
      this.updateElapsedChip();
    };

    this.updateElapsedChip();
    this.elapsedIntervalId = window.setInterval(() => this.updateElapsedChip(), 1000);
  }

  private updateElapsedChip(): void {
    const session = this.session;
    if (!session || !this.elapsedChipEl || !this.elapsedIconEl || !this.elapsedValueEl) {
      return;
    }
    const running = isSessionTimerRunning(session);
    this.elapsedValueEl.setText(formatElapsed(getSessionElapsedMs(session)));
    this.elapsedChipEl.toggleClass("is-paused", !running);
    setIcon(this.elapsedIconEl, running ? "pause" : "play");
    const label = running
      ? "Workout time — click to pause"
      : "Workout timer paused — click to resume";
    this.elapsedChipEl.setAttr("aria-label", label);
    this.elapsedChipEl.setAttr("title", label);
  }

  private stopElapsedTicker(): void {
    if (this.elapsedIntervalId !== null) {
      window.clearInterval(this.elapsedIntervalId);
      this.elapsedIntervalId = null;
    }
    this.elapsedChipEl = null;
    this.elapsedIconEl = null;
    this.elapsedValueEl = null;
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
    const displayLabel = this.getSetDisplayLabel(exercise.sets, index);
    const setTypeBtnMobile = header.createEl("button", {
      text: displayLabel,
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

    const isCardio = exercise.exerciseType === "cardio";
    const durationOnly = isDurationOnly(exercise.exerciseType);
    const repsOnly = isRepsOnly(exercise.exerciseType);
    const isRoutineEdit = !!this.session?.routineEditMode;
    if (durationOnly) {
      header.createSpan({
        text: `${set.duration ?? "0"}s`,
        cls: "workout-session-set-card-target",
      });
      this.renderDurationEditor(header, set.duration, (duration) => {
        set.duration = duration;
        if (this.session) this.session.hasRoutineChanges = true;
      });
      if (this.session?.isCircle) {
        header.createSpan({ text: "pause", cls: "workout-session-set-card-target" });
        this.renderDurationEditor(header, set.restTime, (restTime) => {
          set.restTime = restTime;
          if (this.session) this.session.hasRoutineChanges = true;
        });
      }
    } else if (isCardio) {
      const targetText = `${set.duration ?? "0"}min / ${set.distance ?? "0"}${this.distanceUnit()}`;
      header.createSpan({ text: targetText, cls: "workout-session-set-card-target" });
      this.renderCardioEditor(header, set.duration, set.distance, (duration, distance) => {
        set.duration = duration;
        set.distance = distance;
      });
    } else if (repsOnly) {
      header.createSpan({
        text: `${set.targetReps ?? "0"} reps`,
        cls: "workout-session-set-card-target",
      });
      this.renderRepsEditor(
        header,
        isRoutineEdit ? set.targetReps : set.actualReps,
        (reps) => {
          if (isRoutineEdit) {
            set.targetReps = reps;
            if (this.session) this.session.hasRoutineChanges = true;
          } else {
            set.actualReps = reps;
          }
        }
      );
    } else {
      const targetText = `${set.targetWeight ?? "0"} × ${set.targetReps ?? "0"}`;
      header.createSpan({ text: targetText, cls: "workout-session-set-card-target" });
      this.renderSetEditor(header, isRoutineEdit ? set.targetWeight : set.actualWeight, isRoutineEdit ? set.targetReps : set.actualReps, (weight, reps) => {
        if (isRoutineEdit) {
          set.targetWeight = weight;
          set.targetReps = reps;
          if (this.session) this.session.hasRoutineChanges = true;
        } else {
          set.actualWeight = weight;
          set.actualReps = reps;
        }
      });
    }

    const headerRight = header.createDiv({ cls: "workout-session-set-card-header-right" });
    if (!isRoutineEdit) {
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
        this.plugin.persistActiveSession();
      };
    }

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
      placeholder: this.plugin.settings.weightUnit || "kg",
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

  private renderRepsEditor(
    container: HTMLElement,
    reps: number | undefined,
    onChange: (reps: number | undefined) => void
  ) {
    const wrapper = container.createDiv({
      cls: "workout-session-set-editor workout-session-reps-editor",
    });
    const repsInput = wrapper.createEl("input", { type: "number", placeholder: "Reps" });
    repsInput.value = reps !== undefined ? String(reps) : "";

    const update = () => {
      onChange(repsInput.value ? parseInt(repsInput.value) : undefined);
    };
    repsInput.oninput = update;
    repsInput.onchange = update;
  }

  private renderDurationEditor(
    container: HTMLElement,
    duration: number | undefined,
    onChange: (duration: number | undefined) => void
  ) {
    const wrapper = container.createDiv({
      cls: "workout-session-set-editor workout-session-duration-editor",
    });
    const durationInput = wrapper.createEl("input", { type: "number", placeholder: "sec" });
    durationInput.min = "0";
    durationInput.value = duration !== undefined ? String(duration) : "";

    const update = () => {
      onChange(durationInput.value ? parseFloat(durationInput.value) : undefined);
    };
    durationInput.oninput = update;
    durationInput.onchange = update;
  }

  /** The configured distance unit label, used for cardio inputs and summaries. */
  private distanceUnit(): string {
    return this.plugin.settings.distanceUnit || "km";
  }

  private renderCardioEditor(
    container: HTMLElement,
    duration: number | undefined,
    distance: number | undefined,
    onChange: (duration: number | undefined, distance: number | undefined) => void
  ) {
    const wrapper = container.createDiv({ cls: "workout-session-set-editor workout-session-cardio-editor" });
    const durationInput = wrapper.createEl("input", { type: "number", placeholder: "min" });
    durationInput.value = duration !== undefined ? String(duration) : "";
    const distanceInput = wrapper.createEl("input", {
      type: "number",
      placeholder: this.distanceUnit(),
    });
    distanceInput.value = distance !== undefined ? String(distance) : "";

    const update = () => {
      const nextDuration = durationInput.value ? parseFloat(durationInput.value) : undefined;
      const nextDistance = distanceInput.value ? parseFloat(distanceInput.value) : undefined;
      onChange(nextDuration, nextDistance);
    };
    durationInput.oninput = update;
    durationInput.onchange = update;
    distanceInput.oninput = update;
    distanceInput.onchange = update;
  }

  /**
   * Pointer-driven reordering. The card geometry is snapshotted once when the
   * drag starts and kept in content coordinates, so the shifts applied to the
   * other cards can never feed back into the target calculation (which is what
   * made the list jitter underneath the pointer).
   */
  private attachDragHandle(
    handle: HTMLElement,
    sourceIndex: number,
    cardEls: HTMLElement[],
    session: WorkoutSession
  ): void {
    let pendingDrag = false;
    let dragActive = false;
    let startY = 0;
    let pointerId: number | null = null;
    let ghostEl: HTMLElement | null = null;
    let ghostOffsetY = 0;
    let currentTarget = sourceIndex;
    let step = 0;
    /** Card centres in content space (viewport top + scrollTop), captured once. */
    let centers: number[] = [];
    let autoScrollRaf: number | null = null;
    let lastPointerY = 0;

    const DRAG_THRESHOLD = 6;
    const SCROLL_ZONE = 80;
    const SCROLL_SPEED = 12;
    const scrollEl = this.contentEl;

    const toContentY = (pointerY: number): number =>
      pointerY - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;

    const stopAutoScroll = () => {
      if (autoScrollRaf !== null) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
    };

    const tickAutoScroll = () => {
      const rect = scrollEl.getBoundingClientRect();
      const distTop = lastPointerY - rect.top;
      const distBottom = rect.bottom - lastPointerY;
      if (distTop < SCROLL_ZONE) {
        scrollEl.scrollTop -= SCROLL_SPEED * (1 - distTop / SCROLL_ZONE);
      } else if (distBottom < SCROLL_ZONE) {
        scrollEl.scrollTop += SCROLL_SPEED * (1 - distBottom / SCROLL_ZONE);
      } else {
        autoScrollRaf = null;
        return;
      }
      updateTarget();
      autoScrollRaf = window.requestAnimationFrame(tickAutoScroll);
    };

    /**
     * The drop index is the number of other cards whose centre sits above the
     * pointer — monotonic in the pointer position, so it cannot oscillate.
     */
    const getTargetIndex = (pointerY: number): number => {
      const contentY = toContentY(pointerY);
      let insertion = 0;
      for (let i = 0; i < centers.length; i++) {
        if (i === sourceIndex) continue;
        if (centers[i] < contentY) insertion++;
      }
      return Math.max(0, Math.min(cardEls.length - 1, insertion));
    };

    const applyShifts = (target: number) => {
      cardEls.forEach((card, i) => {
        if (i === sourceIndex) return;
        let shift = 0;
        if (target > sourceIndex && i > sourceIndex && i <= target) {
          shift = -step;
        } else if (target < sourceIndex && i >= target && i < sourceIndex) {
          shift = step;
        }
        card.setCssStyles({ transform: shift ? `translateY(${shift}px)` : "" });
      });
    };

    const updateTarget = () => {
      const next = getTargetIndex(lastPointerY);
      if (next !== currentTarget) {
        currentTarget = next;
        applyShifts(currentTarget);
      }
    };

    const cleanup = () => {
      stopAutoScroll();
      activeDocument.removeEventListener("pointermove", onPointerMove);
      activeDocument.removeEventListener("pointerup", onPointerUp);
      activeDocument.removeEventListener("pointercancel", onPointerUp);
      if (pointerId !== null) {
        if (handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
        pointerId = null;
      }
      if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
      }
      cardEls.forEach((card) => {
        card.setCssStyles({ transform: "" });
        card.removeClass("workout-session-card-drag-transition");
        card.removeClass("workout-session-card-dragging");
      });
      this.contentEl.removeClass("workout-session-drag-active");
      pendingDrag = false;
      dragActive = false;
    };

    const buildGhost = (sourceCard: HTMLElement, pointerY: number) => {
      const sourceRect = sourceCard.getBoundingClientRect();
      const header = sourceCard.querySelector<HTMLElement>(
        ".workout-session-card-header"
      );

      const ghost = activeDocument.body.createDiv({
        cls: "workout-session-card workout-session-card-ghost",
      });
      // Reproduce the collapsed card so the pointer carries the exercise, not
      // an empty panel: same box, same header content, controls stripped out.
      if (header) {
        const headerClone = header.cloneNode(true) as HTMLElement;
        headerClone
          .querySelectorAll(".workout-session-exercise-controls")
          .forEach((el) => el.remove());
        ghost.appendChild(headerClone);
      } else {
        ghost.createDiv({
          cls: "workout-session-exercise-name",
          text: session.exercises[sourceIndex]?.exerciseName ?? "",
        });
      }

      // Keep the grab point under the pointer instead of snapping the card's
      // top-left corner to it.
      ghostOffsetY = Math.min(
        Math.max(pointerY - sourceRect.top, 0),
        sourceRect.height
      );
      ghost.setCssStyles({
        width: `${sourceRect.width}px`,
        left: `${sourceRect.left}px`,
        top: `${pointerY - ghostOffsetY}px`,
      });
      ghostEl = ghost;
    };

    const activateDrag = (pointerY: number) => {
      this.contentEl.addClass("workout-session-drag-active");

      // Measure after the collapse class applies: every card is now its header.
      const rects = cardEls.map((card) => card.getBoundingClientRect());
      const scrollTop = scrollEl.scrollTop;
      const scrollElTop = scrollEl.getBoundingClientRect().top;
      centers = rects.map(
        (rect) => rect.top + rect.height / 2 - scrollElTop + scrollTop
      );
      step =
        rects.length >= 2
          ? rects[1].top - rects[0].top
          : rects[0].height;

      buildGhost(cardEls[sourceIndex], pointerY);

      cardEls.forEach((card, i) => {
        card.addClass("workout-session-card-drag-transition");
        if (i === sourceIndex) card.addClass("workout-session-card-dragging");
      });

      dragActive = true;
      pendingDrag = false;
      currentTarget = getTargetIndex(pointerY);
      applyShifts(currentTarget);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId !== null && e.pointerId !== pointerId) return;
      if (!pendingDrag && !dragActive) return;
      e.preventDefault();
      lastPointerY = e.clientY;

      if (pendingDrag && Math.abs(e.clientY - startY) >= DRAG_THRESHOLD) {
        activateDrag(e.clientY);
      }

      if (!dragActive || !ghostEl) return;

      ghostEl.setCssStyles({ top: `${e.clientY - ghostOffsetY}px` });

      const rect = scrollEl.getBoundingClientRect();
      const inScrollZone =
        lastPointerY < rect.top + SCROLL_ZONE ||
        lastPointerY > rect.bottom - SCROLL_ZONE;
      if (inScrollZone) {
        if (autoScrollRaf === null) {
          autoScrollRaf = window.requestAnimationFrame(tickAutoScroll);
        }
      } else {
        stopAutoScroll();
      }

      updateTarget();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pointerId !== null && e.pointerId !== pointerId) return;
      const wasActive = dragActive;
      const finalTarget = currentTarget;
      cleanup();
      if (wasActive && finalTarget !== sourceIndex) {
        const moved = session.exercises.splice(sourceIndex, 1)[0];
        session.exercises.splice(finalTarget, 0, moved);
        session.hasRoutineChanges = true;
        this.render();
      }
    };

    handle.addEventListener("pointerdown", (e: PointerEvent) => {
      if (cardEls.length < 2) return;
      e.preventDefault();
      e.stopPropagation();
      pendingDrag = true;
      dragActive = false;
      currentTarget = sourceIndex;
      startY = e.clientY;
      lastPointerY = e.clientY;
      pointerId = e.pointerId;
      // Capture so a touch drag belongs to the handle and never turns into a
      // scroll of the panel behind it.
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (error) {
        console.debug("Workout Journal: pointer capture unavailable.", error);
      }
      activeDocument.addEventListener("pointermove", onPointerMove, { passive: false });
      activeDocument.addEventListener("pointerup", onPointerUp);
      activeDocument.addEventListener("pointercancel", onPointerUp);
    });
  }

  private startRestTimer(exerciseIndex: number, duration: number, display: HTMLElement): void {
    const existing = this.timerIntervals.get(exerciseIndex);
    if (existing !== undefined) {
      window.clearInterval(existing);
      this.timerIntervals.delete(exerciseIndex);
    }

    const endTime = Date.now() + duration * 1000;
    this.timerEndTimes.set(exerciseIndex, endTime);
    this.timerDisplays.set(exerciseIndex, display);
    this.ensureVisibilityHandler();

    const tick = () => {
      const endTime = this.timerEndTimes.get(exerciseIndex);
      if (endTime === undefined) return;
      const remaining = Math.ceil((endTime - Date.now()) / 1000);
      if (remaining <= 0) {
        window.clearInterval(this.timerIntervals.get(exerciseIndex));
        this.timerIntervals.delete(exerciseIndex);
        this.timerEndTimes.delete(exerciseIndex);
        this.timerDisplays.delete(exerciseIndex);
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
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    this.timerIntervals.set(exerciseIndex, intervalId);
  }

  private stopRestTimer(exerciseIndex: number, display: HTMLElement): void {
    const id = this.timerIntervals.get(exerciseIndex);
    if (id !== undefined) {
      window.clearInterval(id);
      this.timerIntervals.delete(exerciseIndex);
    }
    this.timerEndTimes.delete(exerciseIndex);
    this.timerDisplays.delete(exerciseIndex);
    display.hide();
    display.textContent = "";
  }

  private resumeTimerDisplay(exerciseIndex: number, display: HTMLElement): void {
    const endTime = this.timerEndTimes.get(exerciseIndex);
    if (endTime === undefined) return;

    const remaining = Math.ceil((endTime - Date.now()) / 1000);
    if (remaining <= 0) {
      this.timerEndTimes.delete(exerciseIndex);
      this.timerDisplays.delete(exerciseIndex);
      this.triggerRestTimerCompletionFeedback();
      new Notice("🏋️ Rest complete! Time for the next set.");
      return;
    }

    this.timerDisplays.set(exerciseIndex, display);
    const existing = this.timerIntervals.get(exerciseIndex);
    if (existing !== undefined) {
      window.clearInterval(existing);
    }
    const tick = () => {
      const timerEnd = this.timerEndTimes.get(exerciseIndex);
      if (timerEnd === undefined) return;
      const rem = Math.ceil((timerEnd - Date.now()) / 1000);
      if (rem <= 0) {
        window.clearInterval(this.timerIntervals.get(exerciseIndex));
        this.timerIntervals.delete(exerciseIndex);
        this.timerEndTimes.delete(exerciseIndex);
        this.timerDisplays.delete(exerciseIndex);
        display.hide();
        display.textContent = "";
        this.triggerRestTimerCompletionFeedback();
        new Notice("🏋️ Rest complete! Time for the next set.");
        return;
      }
      const minutes = Math.floor(rem / 60);
      const seconds = rem % 60;
      display.show();
      display.textContent = `⏱ ${minutes}:${seconds.toString().padStart(2, "0")} — tap to stop`;
    };
    tick();
    const intervalId = window.setInterval(tick, 1000);
    this.timerIntervals.set(exerciseIndex, intervalId);
  }

  private ensureVisibilityHandler(): void {
    if (this.visibilityHandler) return;
    this.visibilityHandler = () => {
      if (activeDocument.visibilityState !== "visible") return;
      this.timerEndTimes.forEach((endTime, exerciseIndex) => {
        const display = this.timerDisplays.get(exerciseIndex);
        if (!display) return;
        const existing = this.timerIntervals.get(exerciseIndex);
        if (existing !== undefined) {
          window.clearInterval(existing);
          this.timerIntervals.delete(exerciseIndex);
        }
        this.resumeTimerDisplay(exerciseIndex, display);
      });
    };
    activeDocument.addEventListener("visibilitychange", this.visibilityHandler);
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
    this.feedback.trigger(
      vibrateEnabled,
      soundEnabled,
      vibrationPattern,
      frequency,
      gainPeak,
      durationSeconds
    );
  }

  async finishWithOptions(options: SessionFinishOptions): Promise<void> {
    await this.plugin.finishActiveSession(options);
  }
}
