import { App, Modal, Setting } from "obsidian";

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
    contentEl.createEl("h2", { text: this.label });

    new Setting(contentEl).addText((text) => {
      text
        .setPlaceholder(this.placeholder)
        .setValue(this.value)
        .onChange((value) => {
          this.value = value;
        });
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Create")
          .setCta()
          .onClick(() => {
            this.onSubmit(this.value.trim() || null);
            this.close();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.onSubmit(null);
          this.close();
        })
      );
  }
}
