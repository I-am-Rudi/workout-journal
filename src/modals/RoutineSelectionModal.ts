import { App, Modal, Setting } from "obsidian";
import { RoutineDefinition } from "../types";

export class RoutineSelectionModal extends Modal {
  routines: RoutineDefinition[];
  onSelect: (routine: RoutineDefinition) => void;

  constructor(
    app: App,
    routines: RoutineDefinition[],
    onSelect: (routine: RoutineDefinition) => void
  ) {
    super(app);
    this.routines = routines;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Start workout from routine" });

    if (this.routines.length === 0) {
      contentEl.createEl("p", { text: "No routine notes found." });
      return;
    }

    this.routines.forEach((routine) => {
      new Setting(contentEl)
        .setName(routine.isCircle ? `${routine.name} (circuit)` : routine.name)
        .setDesc(
          `${routine.exercises.length} exercises${
            routine.estimatedDuration ? ` • ~${routine.estimatedDuration} min` : ""
          }`
        )
        .addButton((btn) =>
          btn.setButtonText("Start").onClick(() => {
            this.onSelect(routine);
            this.close();
          })
        );
    });
  }
}
