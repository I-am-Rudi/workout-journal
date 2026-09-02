import { App, Modal, Setting } from "obsidian";
import { SessionFinishOptions } from "../types";
import { formatDurationMinutes } from "../utils/sessionTimerUtils";

export class SessionFinishModal extends Modal {
  onSubmit: (options: SessionFinishOptions) => void;
  hasUnfinishedSets: boolean;
  /** Minutes the workout timer measured; undefined when it never ran. */
  measuredMinutes?: number;
  options: SessionFinishOptions = {
    fillUncompletedSets: false,
    storeNewTargets: true,
    routineChangeStrategy: "ignore",
  };

  constructor(
    app: App,
    hasUnfinishedSets: boolean,
    measuredMinutes: number | undefined,
    onSubmit: (options: SessionFinishOptions) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.hasUnfinishedSets = hasUnfinishedSets;
    this.measuredMinutes = measuredMinutes;
    this.options.durationMinutes = measuredMinutes;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("wj-finish-modal");

    contentEl.createEl("h2", { text: "Finish workout" });

    if (this.measuredMinutes !== undefined) {
      const summary = contentEl.createDiv({ cls: "wj-finish-duration" });
      summary.createDiv({
        text: "Workout time",
        cls: "wj-finish-duration-label",
      });
      summary.createDiv({
        text: formatDurationMinutes(this.measuredMinutes),
        cls: "wj-finish-duration-value",
      });

      new Setting(contentEl)
        .setName("Logged duration")
        .setDesc("Minutes stored with the workout note.")
        .addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "0";
          text
            .setValue(String(this.measuredMinutes))
            .onChange((value) => {
              const parsed = parseInt(value);
              this.options.durationMinutes =
                Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
            });
        });
    }

    if (this.hasUnfinishedSets) {
      new Setting(contentEl)
        .setName("Finish uncompleted sets?")
        .setDesc("Set incomplete sets to target values and mark them complete.")
        .addToggle((toggle) =>
          toggle.setValue(false).onChange((value) => {
            this.options.fillUncompletedSets = value;
          })
        );
    }

    new Setting(contentEl)
      .setName("Store new target values")
      .setDesc("Use completed set values as targets for next workout.")
      .addToggle((toggle) =>
        toggle.setValue(this.options.storeNewTargets).onChange((value) => {
          this.options.storeNewTargets = value;
        })
      );

    new Setting(contentEl)
      .setName("Routine changes")
      .setDesc("Choose what to do with routine edits made during the workout.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("ignore", "Ignore changes")
          .addOption("overwrite", "Overwrite existing routine")
          .addOption("create_new", "Create new routine")
          .setValue(this.options.routineChangeStrategy)
          .onChange((value) => {
            this.options.routineChangeStrategy = value as
              | "overwrite"
              | "create_new"
              | "ignore";
          })
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Finish workout")
        .setCta()
        .onClick(() => {
          this.onSubmit(this.options);
          this.close();
        })
    );
  }
}
