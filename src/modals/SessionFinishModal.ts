import { App, Modal, Setting } from "obsidian";
import { SessionFinishOptions } from "../types";
import { RoutineChangesModal } from "./RoutineChangesModal";
import { formatDurationMinutes } from "../utils/sessionTimerUtils";
import {
  createActionBar,
  createButton,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

export class SessionFinishModal extends Modal {
  onSubmit: (options: SessionFinishOptions) => void;
  hasUnfinishedSets: boolean;
  /**
   * The routine edits made in the session, one line each. When there are any,
   * finishing asks what to do with them; when empty, the routine is left alone.
   */
  routineChanges: string[];
  routineName: string;
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
    routine: { name: string; changes: string[] },
    measuredMinutes: number | undefined,
    onSubmit: (options: SessionFinishOptions) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.hasUnfinishedSets = hasUnfinishedSets;
    this.routineChanges = routine.changes;
    this.routineName = routine.name;
    this.measuredMinutes = measuredMinutes;
    this.options.durationMinutes = measuredMinutes;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl, "wj-finish-modal");

    renderHeader(contentEl, {
      title: "Finish workout",
      subtitle: "Check the numbers before the note is written",
    });

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

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: "Finish workout",
      variant: "primary",
      onClick: () => this.finish(),
    });
  }

  /**
   * Save straight away when the routine is untouched; otherwise ask first.
   * Backing out of that question leaves this dialog open with nothing saved.
   */
  private finish(): void {
    if (!this.routineChanges.length) {
      this.options.routineChangeStrategy = "ignore";
      this.submit();
      return;
    }
    new RoutineChangesModal(
      this.app,
      { routineName: this.routineName, changes: this.routineChanges },
      (strategy) => {
        this.options.routineChangeStrategy = strategy;
        this.submit();
      }
    ).open();
  }

  private submit(): void {
    this.onSubmit(this.options);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
