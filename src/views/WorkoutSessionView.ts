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
  private timerEndTimes: Map<number, number> = new Map();
  private timerDisplays: Map<number, HTMLElement> = new Map();
  private feedbackAudioContext: AudioContext | null = null;
  private visibilityHandler: (() => void) | null = null;
  private dragState: { sourceIndex: number; cards: HTMLElement[]; ghostEl: HTMLElement | null; targetIndex: number } | null = null;

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
    this.timerEndTimes.clear();
    this.timerDisplays.clear();
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
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
    // Stop intervals but keep timerEndTimes so live timers survive re-renders
    this.timerIntervals.forEach((id) => clearInterval(id));
    this.timerIntervals.clear();
    this.timerDisplays.clear();

    const { contentEl } = this;
    const previousScrollTop = contentEl.scrollTop;
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
            this.plugin.performanceCsvService, session.routineId
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
        noteBlock.createEl("span", {
          text: "📝 Exercise note: ",
          cls: "workout-session-exercise-notes-label",
        });
        noteBlock.createEl("span", {
          text: exercise.exerciseNotes,
          cls: "workout-session-exercise-notes-content",
        });
      }

      const isCardio = exercise.exerciseType === "cardio";

      if (Platform.isMobile) {
        const setsWrapper = card.createDiv({ cls: "workout-session-sets-mobile" });
        exercise.sets.forEach((set, index) => {
          this.renderSetCard(setsWrapper, set, index, exercise, exerciseIndex, timerDisplay, () => this.render());
        });
      } else {
        const tableWrapper = card.createDiv({ cls: "workout-session-table-wrapper" });
        const table = tableWrapper.createEl("table", { cls: "workout-session-table" });
        const header = table.createEl("tr");
        if (isCardio) {
          ["Set", "Prev", "Target", "Actual", "Done", ""].forEach((label) => {
            header.createEl("th", { text: label });
          });
        } else {
          ["Set", "Prev", "Target", "Actual", "Done", ""].forEach((label) => {
            header.createEl("th", { text: label });
          });
        }

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

          if (isCardio) {
            row.createEl("td", {
              text:
                set.duration !== undefined || set.distance !== undefined
                  ? `${set.duration ?? "-"}min / ${set.distance ?? "-"}km`
                  : "-",
            });

            const targetCell = row.createEl("td");
            this.renderCardioEditor(targetCell, set.duration, set.distance, (duration, distance) => {
              set.duration = duration;
              set.distance = distance;
              session.hasRoutineChanges = true;
            });

            const actualCell = row.createEl("td");
            this.renderCardioEditor(actualCell, set.duration, set.distance, (duration, distance) => {
              set.duration = duration;
              set.distance = distance;
            });
          } else {
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
          }

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
        text
          .setValue(session.notes || "")
          .setPlaceholder("Add workout notes…")
          .onChange((value) => {
            session.notes = value;
          })
      );
    const workoutNotesTextArea = contentEl.querySelector(
      ".setting-item:last-of-type textarea"
    ) as HTMLTextAreaElement | null;
    if (workoutNotesTextArea) {
      workoutNotesTextArea.addClass("workout-session-workout-notes");
      workoutNotesTextArea.rows = 4;
    }

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
    contentEl.scrollTop = previousScrollTop;
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

    const isCardio = exercise.exerciseType === "cardio";
    if (isCardio) {
      const targetText = `${set.duration ?? "0"}min / ${set.distance ?? "0"}km`;
      header.createEl("span", { text: targetText, cls: "workout-session-set-card-target" });
      this.renderCardioEditor(header, set.duration, set.distance, (duration, distance) => {
        set.duration = duration;
        set.distance = distance;
      });
    } else {
      const targetText = `${set.targetWeight ?? "0"} × ${set.targetReps ?? "0"}`;
      header.createEl("span", { text: targetText, cls: "workout-session-set-card-target" });
      this.renderSetEditor(header, set.actualWeight, set.actualReps, (weight, reps) => {
        set.actualWeight = weight;
        set.actualReps = reps;
      });
    }

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

  private renderCardioEditor(
    container: HTMLElement,
    duration: number | undefined,
    distance: number | undefined,
    onChange: (duration: number | undefined, distance: number | undefined) => void
  ) {
    const wrapper = container.createDiv({ cls: "workout-session-set-editor workout-session-cardio-editor" });
    const durationInput = wrapper.createEl("input", { type: "number", placeholder: "min" });
    durationInput.value = duration !== undefined ? String(duration) : "";
    const distanceInput = wrapper.createEl("input", { type: "number", placeholder: "km" });
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

  private attachDragHandle(
    handle: HTMLElement,
    sourceIndex: number,
    cardEls: HTMLElement[],
    session: WorkoutSession
  ): void {
    let pendingDrag = false;
    let dragActive = false;
    let startY = 0;
    let ghostEl: HTMLElement | null = null;
    let currentTarget = sourceIndex;
    let capturedStep = 0;
    let autoScrollRaf: number | null = null;
    let lastPointerY = 0;

    const DRAG_THRESHOLD = 6;
    const SCROLL_ZONE = 80;
    const SCROLL_SPEED = 12;
    const scrollEl = this.contentEl;

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
        autoScrollRaf = requestAnimationFrame(tickAutoScroll);
      } else if (distBottom < SCROLL_ZONE) {
        scrollEl.scrollTop += SCROLL_SPEED * (1 - distBottom / SCROLL_ZONE);
        autoScrollRaf = requestAnimationFrame(tickAutoScroll);
      } else {
        autoScrollRaf = null;
      }
    };

    const getTargetIndex = (pointerY: number): number => {
      const n = cardEls.length;
      let best = currentTarget;
      let bestDist = Infinity;
      cardEls.forEach((card, i) => {
        if (i === sourceIndex) return;
        const rect = card.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(pointerY - center);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      return Math.max(0, Math.min(n - 1, best));
    };

    const applyShifts = (target: number) => {
      cardEls.forEach((card, i) => {
        if (i === sourceIndex) return;
        let shift = 0;
        if (target > sourceIndex && i > sourceIndex && i <= target) {
          shift = -capturedStep;
        } else if (target < sourceIndex && i >= target && i < sourceIndex) {
          shift = capturedStep;
        }
        card.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    };

    const cleanup = () => {
      stopAutoScroll();
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }
      cardEls.forEach((card) => {
        card.setCssStyles({ transform: "" });
        card.removeClass("workout-session-card-drag-transition");
        card.removeClass("workout-session-card-dragging");
      });
      this.contentEl.removeClass("workout-session-drag-active");
      pendingDrag = false;
      dragActive = false;
    };

    const activateDrag = (pointerY: number) => {
      const n = cardEls.length;
      this.contentEl.addClass("workout-session-drag-active");

      // Capture collapsed step from live positions after collapse CSS applies
      if (n >= 2) {
        const r0 = cardEls[0].getBoundingClientRect();
        const r1 = cardEls[1].getBoundingClientRect();
        capturedStep = r1.top - r0.top;
      }

      const sourceCard = cardEls[sourceIndex];
      const sourceRect = sourceCard.getBoundingClientRect();
      const headerEl = sourceCard.querySelector(".workout-session-card-header") as HTMLElement | null;

      ghostEl = document.createElement("div");
      ghostEl.className = "workout-session-card workout-session-card-ghost";
      ghostEl.style.width = `${sourceRect.width}px`;
      ghostEl.style.top = `${pointerY}px`;
      ghostEl.style.left = `${sourceRect.left}px`;
      if (headerEl) ghostEl.appendChild(headerEl.cloneNode(true));
      document.body.appendChild(ghostEl);

      cardEls.forEach((card, i) => {
        card.addClass("workout-session-card-drag-transition");
        if (i === sourceIndex) card.addClass("workout-session-card-dragging");
      });

      currentTarget = getTargetIndex(pointerY);
      applyShifts(currentTarget);
      dragActive = true;
      pendingDrag = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pendingDrag && !dragActive) return;
      e.preventDefault();
      lastPointerY = e.clientY;

      if (pendingDrag && Math.abs(e.clientY - startY) >= DRAG_THRESHOLD) {
        activateDrag(e.clientY);
      }

      if (!dragActive || !ghostEl) return;

      ghostEl.style.top = `${e.clientY}px`;

      stopAutoScroll();
      const rect = scrollEl.getBoundingClientRect();
      if (lastPointerY < rect.top + SCROLL_ZONE || lastPointerY > rect.bottom - SCROLL_ZONE) {
        autoScrollRaf = requestAnimationFrame(tickAutoScroll);
      }

      const newTarget = getTargetIndex(e.clientY);
      if (newTarget !== currentTarget) {
        currentTarget = newTarget;
        applyShifts(currentTarget);
      }
    };

    const onPointerUp = () => {
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
      const n = cardEls.length; // evaluated at fire time so card 0 gets correct count
      if (n < 2) return;
      e.preventDefault();
      pendingDrag = true;
      dragActive = false;
      currentTarget = sourceIndex;
      startY = e.clientY;
      lastPointerY = e.clientY;
      document.addEventListener("pointermove", onPointerMove, { passive: false });
      document.addEventListener("pointerup", onPointerUp);
    });
  }

  private startRestTimer(exerciseIndex: number, duration: number, display: HTMLElement): void {
    const existing = this.timerIntervals.get(exerciseIndex);
    if (existing !== undefined) {
      clearInterval(existing);
      this.timerIntervals.delete(exerciseIndex);
    }

    const endTime = Date.now() + duration * 1000;
    this.timerEndTimes.set(exerciseIndex, endTime);
    this.timerDisplays.set(exerciseIndex, display);
    this.ensureVisibilityHandler();

    const tick = () => {
      const remaining = Math.ceil((this.timerEndTimes.get(exerciseIndex)! - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(this.timerIntervals.get(exerciseIndex));
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
    const intervalId = setInterval(tick, 1000);
    this.timerIntervals.set(exerciseIndex, intervalId);
  }

  private stopRestTimer(exerciseIndex: number, display: HTMLElement): void {
    const id = this.timerIntervals.get(exerciseIndex);
    if (id !== undefined) {
      clearInterval(id);
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
      clearInterval(existing);
    }
    const tick = () => {
      const rem = Math.ceil((this.timerEndTimes.get(exerciseIndex)! - Date.now()) / 1000);
      if (rem <= 0) {
        clearInterval(this.timerIntervals.get(exerciseIndex));
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
    const intervalId = setInterval(tick, 1000);
    this.timerIntervals.set(exerciseIndex, intervalId);
  }

  private ensureVisibilityHandler(): void {
    if (this.visibilityHandler) return;
    this.visibilityHandler = () => {
      if (document.visibilityState !== "visible") return;
      this.timerEndTimes.forEach((endTime, exerciseIndex) => {
        const display = this.timerDisplays.get(exerciseIndex);
        if (!display) return;
        const existing = this.timerIntervals.get(exerciseIndex);
        if (existing !== undefined) {
          clearInterval(existing);
          this.timerIntervals.delete(exerciseIndex);
        }
        this.resumeTimerDisplay(exerciseIndex, display);
      });
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
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
