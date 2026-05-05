import { App, Modal, Notice, TFile } from "obsidian";

/**
 * Splits a note's raw content into the preserved prefix (frontmatter + H1 line)
 * and the editable body that comes after it.
 */
function splitNoteContent(content: string): { prefix: string; body: string } {
  // Match the YAML frontmatter block
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  if (!fmMatch) {
    return { prefix: "", body: content };
  }
  const afterFm = content.slice(fmMatch[0].length);

  // Match an optional blank line + H1 heading + newline
  const titleMatch = afterFm.match(/^\n*# [^\n]*\n/);
  if (!titleMatch) {
    return { prefix: fmMatch[0], body: afterFm };
  }

  const prefix = fmMatch[0] + titleMatch[0];
  const body = afterFm.slice(titleMatch[0].length);
  return { prefix, body };
}

export class ExerciseNoteModal extends Modal {
  private filePath: string;
  private exerciseName: string;

  constructor(app: App, filePath: string, exerciseName: string) {
    super(app);
    this.filePath = filePath;
    this.exerciseName = exerciseName;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("exercise-note-modal");

    contentEl.createEl("h3", {
      text: this.exerciseName,
      cls: "exercise-note-modal-title",
    });

    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) {
      contentEl.createEl("p", {
        text: "Exercise note file not found.",
        cls: "exercise-note-modal-error",
      });
      return;
    }

    const raw = await this.app.vault.read(file);
    const { prefix, body } = splitNoteContent(raw);

    const textarea = contentEl.createEl("textarea", {
      cls: "exercise-note-modal-textarea",
    });
    textarea.value = body;
    // Focus and move cursor to end
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 50);

    const footer = contentEl.createDiv({ cls: "exercise-note-modal-footer" });

    const saveBtn = footer.createEl("button", {
      text: "Save",
      cls: "mod-cta exercise-note-modal-save",
    });
    saveBtn.onclick = async () => {
      const newContent = prefix + textarea.value;
      await this.app.vault.modify(file, newContent);
      new Notice(`Saved note for "${this.exerciseName}".`);
      this.close();
    };

    const cancelBtn = footer.createEl("button", {
      text: "Cancel",
      cls: "exercise-note-modal-cancel",
    });
    cancelBtn.onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
