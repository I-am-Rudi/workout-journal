import { App, Modal, Setting } from "obsidian";
import { CircuitTimingAdjustment, WorkoutSession } from "../types";
import { formatSeconds } from "../utils/exerciseTypeUtils";
import {
  createActionBar,
  createButton,
  createNote,
  createStatGrid,
  createStatTile,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

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
    markPluginModal(contentEl);
    renderHeader(contentEl, {
      title: "Circuit complete",
      subtitle: this.session.name,
    });

    const totalSeconds = [...this.performed.values()]
      .flat()
      .reduce((sum, seconds) => sum + seconds, 0);
    const roundsDone = Math.max(
      0,
      ...[...this.performed.values()].map((seconds) => seconds.length)
    );
    const plannedRounds = this.session.circuitRounds ?? 1;

    const stats = createStatGrid(contentEl);
    createStatTile(stats, "Rounds", `${roundsDone}/${plannedRounds}`);
    createStatTile(stats, "Work logged", formatSeconds(totalSeconds));

    new Setting(contentEl).setName("Time windows").setHeading();
    createNote(
      contentEl,
      "These times are saved to the routine for next time. The workout log keeps what you actually performed."
    );

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

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: "Save workout",
      variant: "primary",
      onClick: () => {
        this.onSave({
          adjustments: this.adjustments,
          updateRoutine: this.updateRoutine,
        });
        this.close();
      },
    });
    createButton(actions, {
      label: "Discard",
      variant: "danger",
      onClick: () => {
        this.onDiscard();
        this.close();
      },
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
