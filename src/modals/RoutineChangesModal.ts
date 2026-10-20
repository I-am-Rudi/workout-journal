import { App, Modal, setIcon } from "obsidian";
import { SessionFinishOptions } from "../types";
import { createActionBar, createButton, markPluginModal, renderHeader } from "../utils/uiKit";

type RoutineChangeStrategy = SessionFinishOptions["routineChangeStrategy"];

/**
 * Asked after "Finish workout" when the session changed its routine. There is
 * no default: the workout is only saved once one of the three choices is
 * picked. Closing the prompt (Esc, the X, "Back") returns to the finish dialog
 * and saves nothing.
 *
 * The prompt never grows past the screen: with many changes the list scrolls
 * on its own while the header and the three choices stay in view.
 */
export class RoutineChangesModal extends Modal {
  private routineName: string;
  private changes: string[];
  private onChoose: (strategy: RoutineChangeStrategy) => void;

  constructor(
    app: App,
    options: { routineName: string; changes: string[] },
    onChoose: (strategy: RoutineChangeStrategy) => void
  ) {
    super(app);
    this.routineName = options.routineName;
    this.changes = options.changes;
    this.onChoose = onChoose;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("wj-routine-changes-shell");
    markPluginModal(contentEl, "wj-routine-changes-modal");

    renderHeader(contentEl, {
      title: "Routine changed",
      subtitle: `This workout differs from "${this.routineName}"`,
    });

    const list = contentEl.createEl("ul", { cls: "wj-routine-changes-list" });
    list.setAttr("aria-label", `${this.changes.length} routine changes`);
    list.setAttr("tabindex", "0");
    for (const change of this.changes) {
      list.createEl("li", { text: change });
    }

    const choices = contentEl.createDiv({ cls: "wj-choice-list" });
    this.renderChoice(choices, {
      icon: "save",
      title: "Update routine",
      description: `Save these changes to "${this.routineName}".`,
      strategy: "overwrite",
    });
    this.renderChoice(choices, {
      icon: "copy-plus",
      title: "Save as new routine",
      description: `Keep "${this.routineName}" as it is and save a copy with the changes.`,
      strategy: "create_new",
    });
    this.renderChoice(choices, {
      icon: "undo-2",
      title: "Keep routine as it is",
      description: "Log the workout and discard the routine edits.",
      strategy: "ignore",
    });

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: "Back",
      variant: "quiet",
      onClick: () => this.close(),
    });
  }

  private renderChoice(
    container: HTMLElement,
    choice: {
      icon: string;
      title: string;
      description: string;
      strategy: RoutineChangeStrategy;
    }
  ): void {
    const button = container.createEl("button", { cls: "wj-choice" });
    setIcon(button.createSpan({ cls: "wj-choice-icon" }), choice.icon);
    const text = button.createSpan({ cls: "wj-choice-text" });
    text.createSpan({ text: choice.title, cls: "wj-choice-title" });
    text.createSpan({ text: choice.description, cls: "wj-choice-desc" });
    button.onclick = () => {
      this.close();
      this.onChoose(choice.strategy);
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
