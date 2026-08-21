import { App, Notice, Setting, TFile } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { RoutineBuilderModal } from "./RoutineBuilderModal";

export class RoutineSettingsPage {
  async render(containerEl: HTMLElement, app: App, plugin: WorkoutTrackerPlugin, onBack: () => void): Promise<void> {
    containerEl.empty();

    new Setting(containerEl).addButton((btn) =>
      btn.setButtonText("← Back to general settings").onClick(() => onBack())
    );

    containerEl.createEl("h2", { text: "Routines" });

    const listContainer = containerEl.createDiv();

    const renderList = async () => {
      listContainer.empty();

      if (!plugin.settings.routinesFolder) {
        listContainer.createEl("p", {
          text: "Configure the routines folder in general settings first.",
          cls: "setting-item-description",
        });
        return;
      }

      const routines = await plugin.definitionService.loadRoutineDefinitions();
      routines.sort((a, b) => a.name.localeCompare(b.name));

      if (routines.length === 0) {
        listContainer.createEl("p", {
          text: "No routine notes found. Add your first routine below.",
          cls: "setting-item-description",
        });
        return;
      }

      for (const routine of routines) {
        const exerciseCount = routine.exercises.length;
        const desc = (routine.isCircle ? "Circuit · " : "") +
          `${exerciseCount} exercise${exerciseCount !== 1 ? "s" : ""}` +
          (exerciseCount > 0 ? ` · ${routine.exercises.map((e) => e.exerciseName).join(", ")}` : "");

        const setting = new Setting(listContainer).setName(routine.name).setDesc(desc);

        setting.addButton((btn) =>
          btn.setButtonText("Edit details").onClick(() => {
            new RoutineBuilderModal(app, plugin, () => { void renderList(); }, {
              existing: routine,
            }).open();
          })
        );

        if (routine.filePath) {
          setting.addButton((btn) =>
            btn.setButtonText("Edit sets").onClick(() => {
              const file = app.vault.getAbstractFileByPath(routine.filePath!);
              if (file instanceof TFile) void plugin.openRoutineEditor(file);
            })
          );

          setting.addButton((btn) =>
            btn.setButtonText("Open note").onClick(() => {
              void app.workspace.openLinkText(routine.filePath!, "", false);
            })
          );
        }

        setting.addButton((btn) =>
          btn.setButtonText("Delete").setWarning().onClick(() => {
            void (async () => {
              if (!routine.filePath) {
                new Notice("Cannot delete: file path unknown.");
                return;
              }
              const file = app.vault.getAbstractFileByPath(routine.filePath);
              if (!(file instanceof TFile)) {
                new Notice("Routine note not found.");
                return;
              }
              await app.fileManager.trashFile(file);
              new Notice(`Deleted: ${routine.name}`);
              await renderList();
            })();
          })
        );
      }
    };

    await renderList();

    new Setting(containerEl)
      .addButton((btn) =>
        btn.setButtonText("Add routine").setCta().onClick(() => {
          void plugin.createRoutineNoteFromPrompt(false, () => {
            void renderList();
          });
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Add circuit routine").onClick(() => {
          void plugin.createRoutineNoteFromPrompt(true, () => {
            void renderList();
          });
        })
      );
  }
}
