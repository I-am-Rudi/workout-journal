import { App, Modal } from "obsidian";
import { createActionBar, createButton, createNote, markPluginModal, renderHeader } from "../utils/uiKit";

export class ConfirmModal extends Modal {
  private message: string;
  private onConfirm: () => void;

  constructor(app: App, message: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl);

    renderHeader(contentEl, { title: "Discard workout?" });
    createNote(contentEl, this.message);

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: "Keep session",
      variant: "primary",
      onClick: () => this.close(),
    });
    createButton(actions, {
      label: "Discard session",
      variant: "danger",
      onClick: () => {
        this.onConfirm();
        this.close();
      },
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
