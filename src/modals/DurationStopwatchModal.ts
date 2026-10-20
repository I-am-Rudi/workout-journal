import { App, Modal } from "obsidian";
import { createActionBar, createButton, markPluginModal, renderHeader } from "../utils/uiKit";

export interface DurationStopwatchOptions {
  exerciseName: string;
  setLabel: string;
  /** The planned duration in seconds; shown as a goal, never stops the clock. */
  targetSeconds?: number;
  /** Called once when the clock passes the target. */
  onTargetReached?: () => void;
  /** Called with the timed seconds when the stopwatch is stopped. */
  onSave: (seconds: number) => void;
}

/**
 * A stopwatch for one duration-only set. Stopping it hands the time back to
 * the session, which writes it into the set. Closing the window any other way
 * (Esc, clicking outside) also keeps the time; only "Discard" throws it away,
 * so a stray tap can't lose a long hold.
 */
export class DurationStopwatchModal extends Modal {
  private options: DurationStopwatchOptions;
  private accumulatedMs = 0;
  private startedAt: number | null = null;
  private intervalId: number | null = null;
  private targetAnnounced = false;
  private finished = false;

  private clockEl!: HTMLElement;
  private progressEl: HTMLElement | null = null;
  private actionsEl!: HTMLElement;

  constructor(app: App, options: DurationStopwatchOptions) {
    super(app);
    this.options = options;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl, "wj-stopwatch-modal");

    const target = this.options.targetSeconds;
    renderHeader(contentEl, {
      title: this.options.exerciseName,
      subtitle: target
        ? `${this.options.setLabel} · goal ${formatSeconds(target)}`
        : this.options.setLabel,
    });

    const face = contentEl.createDiv({ cls: "wj-stopwatch-face" });
    face.setAttr("role", "button");
    face.setAttr("tabindex", "0");
    face.setAttr("aria-label", "Start or pause the stopwatch");
    face.onclick = () => this.toggle();
    this.clockEl = face.createDiv({ cls: "wj-stopwatch-clock" });
    face.createDiv({ cls: "wj-stopwatch-hint", text: "Tap the clock or press space" });

    if (target) {
      const track = contentEl.createDiv({ cls: "wj-stopwatch-progress" });
      this.progressEl = track.createDiv({ cls: "wj-stopwatch-progress-fill" });
    }

    this.actionsEl = createActionBar(contentEl);

    // Space toggles, Enter saves. A focused button handles its own keys, so
    // leave those alone rather than firing twice.
    this.modalEl.addEventListener("keydown", (evt: KeyboardEvent) => {
      if (evt.target instanceof HTMLButtonElement) return;
      if (evt.key === " ") {
        evt.preventDefault();
        this.toggle();
      } else if (evt.key === "Enter") {
        evt.preventDefault();
        this.stopAndSave();
      }
    });

    this.intervalId = window.setInterval(() => this.tick(), 100);
    this.renderActions();
    this.tick();
  }

  onClose() {
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
    // Closing without choosing still counts as stopping, unless nothing was timed.
    if (!this.finished && this.elapsedMs() > 0) {
      this.finished = true;
      this.options.onSave(this.elapsedSeconds());
    }
    this.contentEl.empty();
  }

  private elapsedMs(): number {
    return this.accumulatedMs + (this.startedAt !== null ? Date.now() - this.startedAt : 0);
  }

  private elapsedSeconds(): number {
    return Math.max(1, Math.round(this.elapsedMs() / 1000));
  }

  private toggle(): void {
    if (this.startedAt === null) {
      this.startedAt = Date.now();
    } else {
      this.accumulatedMs += Date.now() - this.startedAt;
      this.startedAt = null;
    }
    this.renderActions();
    this.tick();
  }

  private stopAndSave(): void {
    if (this.elapsedMs() === 0) return;
    this.finished = true;
    if (this.startedAt !== null) {
      this.accumulatedMs += Date.now() - this.startedAt;
      this.startedAt = null;
    }
    this.options.onSave(this.elapsedSeconds());
    this.close();
  }

  private discard(): void {
    this.finished = true;
    this.close();
  }

  private tick(): void {
    const ms = this.elapsedMs();
    this.clockEl.setText(formatClock(ms));
    this.contentEl.toggleClass("is-running", this.startedAt !== null);

    const target = this.options.targetSeconds;
    if (target && this.progressEl) {
      const ratio = Math.min(1, ms / (target * 1000));
      this.progressEl.setCssProps({ "--wj-stopwatch-progress": `${ratio * 100}%` });
      const reached = ms >= target * 1000;
      this.contentEl.toggleClass("is-target-reached", reached);
      if (reached && !this.targetAnnounced) {
        this.targetAnnounced = true;
        this.options.onTargetReached?.();
      }
    }
  }

  private renderActions(): void {
    this.actionsEl.empty();
    const running = this.startedAt !== null;
    const started = this.elapsedMs() > 0;

    createButton(this.actionsEl, {
      label: "Discard",
      variant: "secondary",
      onClick: () => this.discard(),
    });
    createButton(this.actionsEl, {
      label: running ? "Pause" : started ? "Resume" : "Start",
      icon: running ? "pause" : "play",
      variant: started ? "secondary" : "primary",
      onClick: () => this.toggle(),
    });
    if (started) {
      createButton(this.actionsEl, {
        label: "Stop & save",
        icon: "square",
        variant: "primary",
        onClick: () => this.stopAndSave(),
      });
    }
  }
}

/** "1:05.3" — minutes, seconds and tenths, for the live clock. */
function formatClock(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor(tenths / 10) % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

/** "45s" or "2:30" — for the goal in the subtitle. */
function formatSeconds(total: number): string {
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
