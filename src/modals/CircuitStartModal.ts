import { App, Modal, Setting } from "obsidian";
import { RoutineDefinition } from "../types";
import { formatSeconds } from "../utils/exerciseTypeUtils";

const DEFAULT_ROUNDS = 1;
const MAX_ROUNDS = 99;

/** Asks how many times the circuit should be repeated before it starts. */
export class CircuitStartModal extends Modal {
  private routine: RoutineDefinition;
  private onStart: (rounds: number) => void;
  private rounds = DEFAULT_ROUNDS;
  private estimateEl: HTMLElement | null = null;

  constructor(
    app: App,
    routine: RoutineDefinition,
    onStart: (rounds: number) => void
  ) {
    super(app);
    this.routine = routine;
    this.onStart = onStart;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `Start circuit: ${this.routine.name}` });

    const list = contentEl.createDiv({ cls: "workout-circuit-start-list" });
    this.routine.exercises.forEach((entry) => {
      const set = entry.sets[0];
      const row = list.createDiv({ cls: "workout-circuit-progress-row" });
      row.createSpan({ text: entry.exerciseName, cls: "workout-circuit-progress-name" });
      row.createSpan({
        text: `${Math.round(set?.duration ?? 0)}s work · ${Math.round(set?.restTime ?? 0)}s pause`,
        cls: "workout-circuit-progress-times",
      });
    });

    new Setting(contentEl)
      .setName("Rounds")
      .setDesc("How many times to run through the circuit")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = String(MAX_ROUNDS);
        text.setValue(String(this.rounds)).onChange((value) => {
          const parsed = parseInt(value);
          this.rounds = Number.isNaN(parsed)
            ? DEFAULT_ROUNDS
            : Math.min(MAX_ROUNDS, Math.max(1, parsed));
          this.updateEstimate();
        });
      });

    this.estimateEl = contentEl.createEl("p", { cls: "setting-item-description" });
    this.updateEstimate();

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Start").setCta().onClick(() => {
          this.onStart(this.rounds);
          this.close();
        })
      )
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }

  private updateEstimate(): void {
    if (!this.estimateEl) return;
    const perRound = this.routine.exercises.reduce((total, entry) => {
      const set = entry.sets[0];
      return total + (set?.duration ?? 0) + (set?.restTime ?? 0);
    }, 0);
    this.estimateEl.setText(
      `Estimated total: ${formatSeconds(perRound * this.rounds)} (${formatSeconds(perRound)} per round)`
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
