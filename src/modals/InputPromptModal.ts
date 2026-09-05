import { App, Modal, Setting } from "obsidian";
import { createActionBar, createButton, markPluginModal, renderHeader } from "../utils/uiKit";

export class InputPromptModal extends Modal {
  label: string;
  placeholder: string;
  onSubmit: (value: string | null) => void;
  value = "";

  constructor(
    app: App,
    label: string,
    placeholder: string,
    onSubmit: (value: string | null) => void,
    defaultValue?: string
  ) {
    super(app);
    this.label = label;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
    if (defaultValue) this.value = defaultValue;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl);

    renderHeader(contentEl, { title: this.label });

    new Setting(contentEl).setName("Name").addText((text) => {
      text
        .setPlaceholder(this.placeholder)
        .setValue(this.value)
        .onChange((value) => {
          this.value = value;
        });
      // Enter submits: this modal only ever asks for one line.
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.submit();
      });
      window.setTimeout(() => text.inputEl.focus(), 50);
    });

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: "Create",
      variant: "primary",
      onClick: () => this.submit(),
    });
    createButton(actions, {
      label: "Cancel",
      variant: "quiet",
      onClick: () => {
        this.onSubmit(null);
        this.close();
      },
    });
  }

  private submit(): void {
    this.onSubmit(this.value.trim() || null);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
