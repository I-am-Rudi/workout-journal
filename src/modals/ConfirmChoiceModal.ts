import { App, Modal } from "obsidian";
import { createActionBar, createButton, createNote, markPluginModal, renderHeader } from "../utils/uiKit";

/**
 * A yes/no prompt with configurable wording, resolved as a promise.
 *
 * `ConfirmModal` is hard-wired to the discard-session question, so anything else
 * that needs a confirmation uses this instead of overloading that one.
 */
export class ConfirmChoiceModal extends Modal {
  private title: string;
  private message: string;
  private confirmLabel: string;
  private cancelLabel: string;
  private resolve: (confirmed: boolean) => void;
  private settled = false;

  constructor(
    app: App,
    options: {
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
    },
    resolve: (confirmed: boolean) => void
  ) {
    super(app);
    this.title = options.title;
    this.message = options.message;
    this.confirmLabel = options.confirmLabel ?? "Replace";
    this.cancelLabel = options.cancelLabel ?? "Cancel";
    this.resolve = resolve;
  }

  /** Promise wrapper so callers can `await` the answer. */
  static ask(
    app: App,
    options: {
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }
  ): Promise<boolean> {
    return new Promise((resolve) => {
      new ConfirmChoiceModal(app, options, resolve).open();
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl);

    renderHeader(contentEl, { title: this.title });
    createNote(contentEl, this.message);

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: this.confirmLabel,
      variant: "primary",
      onClick: () => this.settle(true),
    });
    createButton(actions, {
      label: this.cancelLabel,
      variant: "quiet",
      onClick: () => this.settle(false),
    });
  }

  private settle(confirmed: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(confirmed);
    this.close();
  }

  onClose() {
    // Closing with Escape or the X counts as declining.
    this.settle(false);
    this.contentEl.empty();
  }
}
