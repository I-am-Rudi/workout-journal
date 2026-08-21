import { App, Modal, Setting } from "obsidian";
import { CircuitTimingAdjustment, WorkoutSession } from "../types";
import { formatSeconds } from "../utils/exerciseTypeUtils";

export interface CircuitFinishResult {
  adjustments: CircuitTimingAdjustment[];
  updateRoutine: boolean;
}

/**
 * Post-circuit overview: shows what was performed and lets the user retune the
 * work and pause windows for next time.
 */
export class CircuitSummaryModal extends Modal {
  private session: WorkoutSession;
  /** Work seconds performed per exercise, in round order. */
  private performed: Map<number, number[]>;
  private adjustments: CircuitTimingAdjustment[];
  private updateRoutine: boolean;
  private onSave: (result: CircuitFinishResult) => void;
  private onDiscard: () => void;

  constructor(
    app: App,
    session: WorkoutSession,
    performed: Array<{ exerciseIndex: number; seconds: number[] }>,
    onSave: (result: CircuitFinishResult) => void,
    onDiscard: () => void
  ) {
    super(app);
    this.session = session;
    this.performed = new Map(
      performed.map((entry) => [entry.exerciseIndex, entry.seconds])
    );
    this.onSave = onSave;
    this.onDiscard = onDiscard;
    // The routine can only be rewritten when the session came from a saved one.
    this.updateRoutine = !!session.routineId && !!session.routineName;
    this.adjustments = session.exercises.map((exercise) => {
      const set = exercise.sets[0];
      return {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        workSeconds: Math.round(set?.duration ?? 0),
        restSeconds: Math.round(set?.restTime ?? 0),
      };
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Circuit complete" });

    const totalSeconds = [...this.performed.values()]
      .flat()
      .reduce((sum, seconds) => sum + seconds, 0);
    const roundsDone = Math.max(
      0,
      ...[...this.performed.values()].map((seconds) => seconds.length)
    );
    contentEl.createEl("p", {
      text: `${roundsDone} of ${this.session.circuitRounds ?? 1} round${
        (this.session.circuitRounds ?? 1) === 1 ? "" : "s"
      } · ${formatSeconds(totalSeconds)} of work logged.`,
      cls: "setting-item-description",
    });

    new Setting(contentEl).setName("Time windows").setHeading();
    contentEl.createEl("p", {
      text: "These times are saved to the routine for next time. The workout log keeps what you actually performed.",
      cls: "setting-item-description",
    });

    this.adjustments.forEach((adjustment, index) => {
      const rounds = this.performed.get(index) ?? [];
      new Setting(contentEl)
        .setName(adjustment.exerciseName)
        .setDesc(
          rounds.length
            ? `Performed ${rounds.length}× (${rounds.map((s) => `${s}s`).join(", ")})`
            : "Not performed"
        )
        .addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "0";
          text.inputEl.addClass("workout-circuit-time-input");
          text.inputEl.setAttr("aria-label", `${adjustment.exerciseName} work seconds`);
          text.setPlaceholder("work s").setValue(String(adjustment.workSeconds));
          text.onChange((value) => {
            const parsed = parseInt(value);
            adjustment.workSeconds = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
          });
        })
        .addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "0";
          text.inputEl.addClass("workout-circuit-time-input");
          text.inputEl.setAttr("aria-label", `${adjustment.exerciseName} pause seconds`);
          text.setPlaceholder("pause s").setValue(String(adjustment.restSeconds));
          text.onChange((value) => {
            const parsed = parseInt(value);
            adjustment.restSeconds = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
          });
        });
    });

    if (this.session.routineId) {
      new Setting(contentEl)
        .setName("Save times to routine")
        .setDesc(`Updates "${this.session.routineName ?? this.session.name}".`)
        .addToggle((toggle) =>
          toggle.setValue(this.updateRoutine).onChange((value) => {
            this.updateRoutine = value;
          })
        );
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Save workout").setCta().onClick(() => {
          this.onSave({
            adjustments: this.adjustments,
            updateRoutine: this.updateRoutine,
          });
          this.close();
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Discard").setWarning().onClick(() => {
          this.onDiscard();
          this.close();
        })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
