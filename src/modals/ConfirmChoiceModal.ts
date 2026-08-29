import { App, Modal, Setting } from "obsidian";

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

    new Setting(contentEl).setName(this.title).setHeading();
    contentEl.createEl("p", { text: this.message });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(this.confirmLabel)
          .setCta()
          .onClick(() => this.settle(true))
      )
      .addButton((btn) =>
        btn.setButtonText(this.cancelLabel).onClick(() => this.settle(false))
      );
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
