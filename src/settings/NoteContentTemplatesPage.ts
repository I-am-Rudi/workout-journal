import { Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { createBackButton, createNote, renderHeader } from "../utils/uiKit";

const NOTE_TYPES: Array<{ key: "exercise" | "routine" | "plan" | "workout"; label: string }> = [
  { key: "exercise", label: "Exercise note" },
  { key: "routine", label: "Routine note" },
  { key: "plan", label: "Plan note" },
  { key: "workout", label: "Workout note" },
];

export class NoteContentTemplatesPage {
  render(containerEl: HTMLElement, plugin: WorkoutTrackerPlugin, onBack: () => void): void {
    containerEl.empty();
    containerEl.addClass("wj-settings");

    createBackButton(containerEl, "Back to settings", () => onBack());
    renderHeader(containerEl, {
      title: "Note content templates",
      subtitle: "Extra frontmatter and body text for each generated note",
    });

    createNote(
      containerEl,
      "Plugin-managed properties (wj-id, wj-name, wj-type, and so on) always take precedence over template frontmatter.",
      "accent"
    );

    for (const { key, label } of NOTE_TYPES) {
      new Setting(containerEl).setName(label).setHeading();

      new Setting(containerEl)
        .setName("Additional frontmatter")
        .setDesc("YAML properties merged into the note frontmatter (plugin properties take precedence).")
        .addTextArea((ta) => {
          ta.setPlaceholder("Example: tag: my-tag\nstatus: active")
            .setValue(plugin.settings.noteTemplates?.[key]?.frontmatter ?? "")
            .onChange(async (value) => {
              if (!plugin.settings.noteTemplates) {
                plugin.settings.noteTemplates = {};
              }
              if (!plugin.settings.noteTemplates[key]) {
                plugin.settings.noteTemplates[key] = {};
              }
              const template = plugin.settings.noteTemplates[key];
              if (!template) {
                return;
              }
              template.frontmatter = value;
              await plugin.saveSettings();
            });
          ta.inputEl.rows = 4;
          ta.inputEl.addClass("note-template-frontmatter-ta");
        });

      new Setting(containerEl)
        .setName("Additional body")
        .setDesc("Markdown text appended beneath the generated note content.")
        .addTextArea((ta) => {
          ta.setPlaceholder("## My section\n\nCustom content here…")
            .setValue(plugin.settings.noteTemplates?.[key]?.body ?? "")
            .onChange(async (value) => {
              if (!plugin.settings.noteTemplates) {
                plugin.settings.noteTemplates = {};
              }
              if (!plugin.settings.noteTemplates[key]) {
                plugin.settings.noteTemplates[key] = {};
              }
              const template = plugin.settings.noteTemplates[key];
              if (!template) {
                return;
              }
              template.body = value;
              await plugin.saveSettings();
            });
          ta.inputEl.rows = 6;
          ta.inputEl.addClass("note-template-body-ta");
        });
    }
  }
}
