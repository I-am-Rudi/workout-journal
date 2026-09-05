import { App, Editor, Modal } from "obsidian";
import { ExerciseTemplate } from "../types";
import WorkoutTrackerPlugin from "../plugin";
import {
  createButton,
  createEmptyState,
  createList,
  createRow,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

export class ExerciseTemplateModal extends Modal {
  plugin: WorkoutTrackerPlugin;
  editor: Editor;

  constructor(app: App, plugin: WorkoutTrackerPlugin, editor: Editor) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl);

    renderHeader(contentEl, {
      title: "Insert exercise template",
      subtitle: "Drops a filled-in set table at the cursor",
    });

    const templates = this.plugin.settings.exerciseTemplates;
    if (!templates.length) {
      createEmptyState(contentEl, {
        title: "No exercise templates yet",
        body: "Add one in the plugin settings to insert it from here.",
      });
      return;
    }

    const list = createList(contentEl);
    templates.forEach((template) => {
      const { actions } = createRow(list, {
        title: template.name,
        meta: template.muscleGroups.join(", ") || "No muscle groups",
        chips: [{ text: template.type }],
      });
      createButton(actions, {
        label: "Insert",
        variant: "secondary",
        onClick: () => {
          this.editor.replaceSelection(this.generateExerciseTemplate(template));
          this.close();
        },
      });
    });
  }

  generateExerciseTemplate(template: ExerciseTemplate): string {
    let text = `### ${template.name}\n\n`;
    text += `**Type:** ${template.type}\n`;
    text += `**Muscle Groups:** ${template.muscleGroups.join(", ")}\n\n`;

    if (template.defaultSets) {
      text += `| Set | Reps | Weight | Duration | Rest |\n`;
      text += `|-----|------|--------|----------|------|\n`;
      for (let i = 1; i <= template.defaultSets; i++) {
        text += `| ${i} | ${template.defaultReps || ""} | ${template.defaultWeight || ""} | ${template.defaultDuration || ""} |  |\n`;
      }
    }

    text += `\n**Notes:** \n\n`;
    return text;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
