import { ItemView, Notice, Setting, WorkspaceLeaf } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { CircuitStep, WorkoutSession } from "../types";
import { ConfirmModal } from "../modals/ConfirmModal";
import { FeedbackPlayer } from "../utils/feedbackUtils";
import { formatSeconds } from "../utils/exerciseTypeUtils";

export const CIRCUIT_SESSION_VIEW_TYPE = "workout-tracker-circuit-view";

const TICK_INTERVAL_MS = 200;
/** Beyond this overshoot a step boundary is treated as a suspended timer. */
const BACKGROUND_GAP_MS = 3000;
/** How far into an interval the back arrow restarts it instead of stepping back. */
const RESTART_WINDOW_SECONDS = 3;

/**
 * Guided player for circuit routines: it walks through the exercises, counting
 * down each work interval and the pause after it, for the configured number of
 * rounds. The user only controls play/pause, finish and cancel.
 */
export class CircuitSessionView extends ItemView {
  plugin: WorkoutTrackerPlugin;
  session: WorkoutSession | null = null;

  private steps: CircuitStep[] = [];
  private stepIndex = 0;
  /** Absolute epoch ms when the current step ends; survives screen lock. */
  private stepEndTime: number | null = null;
  /** Remaining ms of the current step while paused. */
  private pausedRemainingMs: number | null = null;
  private tickIntervalId: number | null = null;
  private finished = false;

  /** Seconds actually performed per `${exerciseIndex}:${round}` work step. */
  private performedWork: Map<string, number> = new Map();

  private feedback = new FeedbackPlayer();
  private visibilityHandler: (() => void) | null = null;

  private countdownEl: HTMLElement | null = null;
  private stepLabelEl: HTMLElement | null = null;
  private exerciseNameEl: HTMLElement | null = null;
  private roundLabelEl: HTMLElement | null = null;
  private upNextEl: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private playPauseBtn: HTMLButtonElement | null = null;
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WorkoutTrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CIRCUIT_SESSION_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Circuit session";
  }

  async onOpen(): Promise<void> {
    if (this.plugin.activeSession) {
      this.setSession(this.plugin.activeSession);
    } else {
      this.render();
    }
  }

  async onClose(): Promise<void> {
    this.stopTicking();
    if (this.visibilityHandler) {
      activeDocument.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.feedback.dispose();
    this.contentEl.empty();
  }

  /**
   * `autoStart` is only set when the user just pressed Start. A session that
   * was restored after a restart is armed but held, so a forgotten circuit
   * cannot start counting down on its own.
   */
  setSession(session: WorkoutSession, autoStart = false): void {
    this.session = session;
    this.steps = this.buildSteps(session);
    this.stepIndex = 0;
    this.performedWork.clear();
    this.finished = false;
    this.pausedRemainingMs = null;
    this.stepEndTime = null;
    this.render();
    if (!this.steps.length) return;
    if (autoStart) {
      this.startStep(0);
    } else {
      this.armStep(0);
    }
  }

  /**
   * Flattens the circuit into a work/pause timeline. The pause after the very
   * last exercise of the last round is dropped — the circuit is over.
   */
  private buildSteps(session: WorkoutSession): CircuitStep[] {
    const rounds = Math.max(1, session.circuitRounds ?? 1);
    const steps: CircuitStep[] = [];
    for (let round = 1; round <= rounds; round++) {
      session.exercises.forEach((exercise, exerciseIndex) => {
        const set = exercise.sets[0];
        const work = Math.max(0, Math.round(set?.duration ?? 0));
        const rest = Math.max(0, Math.round(set?.restTime ?? 0));
        if (work > 0) {
          steps.push({
            round,
            exerciseIndex,
            exerciseName: exercise.exerciseName,
            kind: "work",
            seconds: work,
          });
        }
        const isLastOfCircuit =
          round === rounds && exerciseIndex === session.exercises.length - 1;
        if (rest > 0 && !isLastOfCircuit) {
          steps.push({
            round,
            exerciseIndex,
            exerciseName: exercise.exerciseName,
            kind: "rest",
            seconds: rest,
          });
        }
      });
    }
    return steps;
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("workout-circuit-view");

    const session = this.session;
    if (!session) {
      contentEl.createEl("p", { text: "No active circuit session." });
      return;
    }

    const titleEl = contentEl.createDiv({
      text: session.name,
      cls: "workout-session-title",
    });
    titleEl.setAttr("role", "heading");
    titleEl.setAttr("aria-level", "2");

    this.roundLabelEl = contentEl.createDiv({ cls: "workout-circuit-round" });

    if (!this.steps.length) {
      contentEl.createEl("p", {
        text: "This circuit has no timed exercises. Give each exercise a duration first.",
      });
      new Setting(contentEl).addButton((btn) =>
        btn.setButtonText("Cancel session").setWarning().onClick(() => {
          void this.plugin.cancelActiveSession();
        })
      );
      return;
    }

    const stage = contentEl.createDiv({ cls: "workout-circuit-stage" });
    this.stepLabelEl = stage.createDiv({ cls: "workout-circuit-step-label" });
    this.exerciseNameEl = stage.createDiv({ cls: "workout-circuit-exercise" });
    this.countdownEl = stage.createDiv({ cls: "workout-circuit-countdown" });
    this.upNextEl = stage.createDiv({ cls: "workout-circuit-upnext" });

    const transport = contentEl.createDiv({ cls: "workout-circuit-transport" });
    this.prevBtn = transport.createEl("button", {
      text: "◀",
      cls: "workout-circuit-btn workout-circuit-btn-step",
      attr: { "aria-label": "Previous interval", title: "Previous interval" },
    });
    this.prevBtn.onclick = () => this.goToPreviousStep();

    this.playPauseBtn = transport.createEl("button", {
      text: "Pause",
      cls: "workout-circuit-btn workout-circuit-btn-primary",
    });
    this.playPauseBtn.onclick = () => this.togglePlayPause();

    this.nextBtn = transport.createEl("button", {
      text: "▶",
      cls: "workout-circuit-btn workout-circuit-btn-step",
      attr: { "aria-label": "Skip interval", title: "Skip interval" },
    });
    this.nextBtn.onclick = () => this.goToNextStep();

    const controls = contentEl.createDiv({ cls: "workout-circuit-controls" });

    const finishBtn = controls.createEl("button", {
      text: "Finish",
      cls: "workout-circuit-btn",
    });
    finishBtn.onclick = () => this.finish();

    const cancelBtn = controls.createEl("button", {
      text: "Cancel",
      cls: "workout-circuit-btn workout-circuit-btn-warning",
    });
    cancelBtn.onclick = () => {
      this.pause();
      new ConfirmModal(
        this.app,
        "Are you sure you want to cancel this circuit? Nothing will be logged.",
        () => {
          void this.plugin.cancelActiveSession();
        }
      ).open();
    };

    this.progressEl = contentEl.createDiv({ cls: "workout-circuit-progress" });
    this.renderProgress();
    this.updateDisplay();
  }

  private renderProgress(): void {
    const container = this.progressEl;
    const session = this.session;
    if (!container || !session) return;
    container.empty();

    const current = this.steps[this.stepIndex];
    session.exercises.forEach((exercise, index) => {
      const set = exercise.sets[0];
      const row = container.createDiv({ cls: "workout-circuit-progress-row" });
      if (current && current.exerciseIndex === index && !this.finished) {
        row.addClass("workout-circuit-progress-row-active");
      }
      row.createSpan({ text: exercise.exerciseName, cls: "workout-circuit-progress-name" });
      row.createSpan({
        text: `${Math.round(set?.duration ?? 0)}s work · ${Math.round(set?.restTime ?? 0)}s pause`,
        cls: "workout-circuit-progress-times",
      });
    });
  }

  /** Loads a step without starting its countdown. */
  private armStep(index: number): void {
    const step = this.steps[index];
    if (!step) return;
    this.stepIndex = index;
    this.stepEndTime = null;
    this.pausedRemainingMs = step.seconds * 1000;
    this.renderProgress();
    this.updateDisplay();
    if (this.playPauseBtn) {
      this.playPauseBtn.textContent = this.performedWork.size ? "Resume" : "Start";
    }
    this.ensureVisibilityHandler();
  }

  private startStep(index: number): void {
    const step = this.steps[index];
    if (!step) {
      this.finish();
      return;
    }
    this.stepIndex = index;
    this.pausedRemainingMs = null;
    this.stepEndTime = Date.now() + step.seconds * 1000;
    this.renderProgress();
    this.updateDisplay();
    this.startTicking();
    this.ensureVisibilityHandler();
  }

  private startTicking(): void {
    this.stopTicking();
    this.tickIntervalId = window.setInterval(
      () => this.tick(),
      TICK_INTERVAL_MS
    ) as unknown as number;
    if (this.playPauseBtn) this.playPauseBtn.textContent = "Pause";
  }

  private stopTicking(): void {
    if (this.tickIntervalId !== null) {
      window.clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
  }

  private get isRunning(): boolean {
    return this.tickIntervalId !== null;
  }

  private tick(): void {
    if (this.stepEndTime === null) return;
    const remainingMs = this.stepEndTime - Date.now();
    if (remainingMs > 0) {
      this.updateDisplay();
      return;
    }

    const overshotMs = -remainingMs;
    this.completeCurrentStep(this.steps[this.stepIndex]?.seconds ?? 0);
    this.advance();
    // A large overshoot means the timer was suspended (screen off, app in the
    // background). Hold at the next interval rather than dropping the user into
    // the middle of it.
    if (overshotMs > BACKGROUND_GAP_MS && !this.finished) {
      this.pause();
    }
  }

  /** Records how much of the current work step was actually performed. */
  private completeCurrentStep(performedSeconds: number): void {
    const step = this.steps[this.stepIndex];
    if (!step || step.kind !== "work") return;
    const key = `${step.exerciseIndex}:${step.round}`;
    this.performedWork.set(key, Math.max(0, Math.round(performedSeconds)));
  }

  private advance(): void {
    const nextIndex = this.stepIndex + 1;
    if (nextIndex >= this.steps.length) {
      this.stopTicking();
      this.stepEndTime = null;
      this.finish();
      return;
    }
    const next = this.steps[nextIndex];
    this.triggerStepFeedback(next.kind);
    this.startStep(nextIndex);
  }

  /**
   * Manual navigation. Skipping forward credits the work done so far so the log
   * still reflects reality; stepping back drops the interval being left behind
   * and re-runs it from the top.
   */
  private goToNextStep(): void {
    if (this.finished || !this.steps.length) return;
    const wasRunning = this.isRunning;
    const step = this.steps[this.stepIndex];
    if (step?.kind === "work") {
      this.completeCurrentStep(Math.max(0, step.seconds - this.remainingSeconds()));
    }
    if (this.stepIndex + 1 >= this.steps.length) {
      this.finish();
      return;
    }
    this.moveToStep(this.stepIndex + 1, wasRunning);
  }

  private goToPreviousStep(): void {
    if (this.finished || !this.steps.length) return;
    const wasRunning = this.isRunning;
    const step = this.steps[this.stepIndex];
    if (step?.kind === "work") {
      this.performedWork.delete(`${step.exerciseIndex}:${step.round}`);
    }
    // Past the first few seconds, "back" restarts the current interval — the
    // same behaviour as a music player's previous-track button.
    const restartCurrent =
      this.stepIndex === 0 ||
      (step !== undefined && step.seconds - this.remainingSeconds() > RESTART_WINDOW_SECONDS);
    const target = restartCurrent ? this.stepIndex : this.stepIndex - 1;
    const previous = this.steps[target];
    if (previous?.kind === "work") {
      this.performedWork.delete(`${previous.exerciseIndex}:${previous.round}`);
    }
    this.moveToStep(target, wasRunning);
  }

  private moveToStep(index: number, running: boolean): void {
    if (running) {
      this.startStep(index);
    } else {
      this.stopTicking();
      this.armStep(index);
    }
  }

  private togglePlayPause(): void {
    if (this.isRunning) {
      this.pause();
    } else {
      this.resume();
    }
  }

  private pause(): void {
    if (!this.isRunning || this.stepEndTime === null) return;
    this.pausedRemainingMs = Math.max(0, this.stepEndTime - Date.now());
    this.stepEndTime = null;
    this.stopTicking();
    if (this.playPauseBtn) this.playPauseBtn.textContent = "Resume";
    this.updateDisplay();
  }

  private resume(): void {
    if (this.finished || this.isRunning) return;
    const remaining = this.pausedRemainingMs;
    if (remaining === null) return;
    this.stepEndTime = Date.now() + remaining;
    this.pausedRemainingMs = null;
    this.startTicking();
    this.updateDisplay();
  }

  private remainingSeconds(): number {
    if (this.pausedRemainingMs !== null) {
      return Math.ceil(this.pausedRemainingMs / 1000);
    }
    if (this.stepEndTime === null) return 0;
    return Math.max(0, Math.ceil((this.stepEndTime - Date.now()) / 1000));
  }

  private updateDisplay(): void {
    const step = this.steps[this.stepIndex];
    if (!step) return;

    const session = this.session;
    const rounds = Math.max(1, session?.circuitRounds ?? 1);
    if (this.roundLabelEl) {
      this.roundLabelEl.setText(`Round ${step.round} of ${rounds}`);
    }
    if (this.stepLabelEl) {
      this.stepLabelEl.setText(step.kind === "work" ? "Work" : "Pause");
      this.stepLabelEl.toggleClass("workout-circuit-step-rest", step.kind === "rest");
    }
    if (this.exerciseNameEl) {
      this.exerciseNameEl.setText(step.exerciseName);
    }
    if (this.countdownEl) {
      this.countdownEl.setText(formatSeconds(this.remainingSeconds()));
      this.countdownEl.toggleClass("workout-circuit-countdown-paused", !this.isRunning);
    }
    if (this.prevBtn) {
      this.prevBtn.disabled = this.finished;
    }
    if (this.nextBtn) {
      this.nextBtn.disabled = this.finished;
    }
    if (this.upNextEl) {
      const next = this.steps[this.stepIndex + 1];
      this.upNextEl.setText(
        next
          ? `Up next: ${next.kind === "rest" ? "pause" : next.exerciseName} · ${next.seconds}s`
          : "Last interval"
      );
    }
  }

  private triggerStepFeedback(kind: CircuitStep["kind"]): void {
    const settings = this.plugin.settings;
    // A work interval starting is the cue that matters most, so it gets the
    // stronger pattern; the pause reuses the softer set-completion feedback.
    if (kind === "work") {
      this.feedback.trigger(
        settings.enableRestTimerVibrationFeedback,
        settings.enableRestTimerSoundFeedback,
        [260, 100, 260],
        880,
        0.08,
        0.14
      );
    } else {
      this.feedback.trigger(
        settings.enableSetCompletionVibrationFeedback,
        settings.enableSetCompletionSoundFeedback,
        [90],
        660,
        0.08,
        0.08
      );
    }
  }

  private ensureVisibilityHandler(): void {
    if (this.visibilityHandler) return;
    this.visibilityHandler = () => {
      if (activeDocument.visibilityState !== "visible") return;
      if (!this.isRunning || this.stepEndTime === null) return;
      // Settle the step boundary that may have passed while the screen was off.
      this.tick();
    };
    activeDocument.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private finish(): void {
    if (this.finished) return;
    const session = this.session;
    if (!session) return;

    // Credit the interval in progress with the time already spent on it.
    const step = this.steps[this.stepIndex];
    if (step && step.kind === "work") {
      const elapsed = step.seconds - this.remainingSeconds();
      this.completeCurrentStep(Math.max(0, elapsed));
    }

    this.finished = true;
    this.stopTicking();
    this.stepEndTime = null;
    this.pausedRemainingMs = null;

    const performed = this.collectPerformedSets(session);
    if (!performed.some((entry) => entry.seconds.length)) {
      new Notice("Nothing was performed — circuit discarded.");
      void this.plugin.cancelActiveSession();
      return;
    }

    void this.plugin.openCircuitSummary(performed);
  }

  /** Per-exercise list of the work seconds performed, in round order. */
  private collectPerformedSets(
    session: WorkoutSession
  ): Array<{ exerciseIndex: number; seconds: number[] }> {
    const rounds = Math.max(1, session.circuitRounds ?? 1);
    return session.exercises.map((_, exerciseIndex) => {
      const seconds: number[] = [];
      for (let round = 1; round <= rounds; round++) {
        const value = this.performedWork.get(`${exerciseIndex}:${round}`);
        if (value !== undefined && value > 0) {
          seconds.push(value);
        }
      }
      return { exerciseIndex, seconds };
    });
  }
}
