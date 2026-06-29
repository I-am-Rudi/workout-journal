import { App, Notice, Setting, TFile } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { ExerciseDefinitionModal } from "../modals/ExerciseDefinitionModal";

export class ExerciseSettingsPage {
  async render(containerEl: HTMLElement, app: App, plugin: WorkoutTrackerPlugin, onBack: () => void): Promise<void> {
    containerEl.empty();

    new Setting(containerEl).addButton((btn) =>
      btn.setButtonText("← Back to general settings").onClick(() => onBack())
    );

    containerEl.createEl("h2", { text: "Exercise library" });

    const listContainer = containerEl.createDiv();

    const renderList = async () => {
      listContainer.empty();

      if (!plugin.settings.exerciseLibraryFolder) {
        listContainer.createEl("p", {
          text: "Configure the exercise library folder in general settings first.",
          cls: "setting-item-description",
        });
        return;
      }

      const exercises = await plugin.definitionService.loadExerciseDefinitions();
      exercises.sort((a, b) => a.name.localeCompare(b.name));

      if (exercises.length === 0) {
        listContainer.createEl("p", {
          text: "No exercise notes found. Add your first exercise below.",
          cls: "setting-item-description",
        });
        return;
      }

      for (const exercise of exercises) {
        const desc = [
          exercise.type,
          exercise.muscleGroups.length ? exercise.muscleGroups.join(", ") : null,
          exercise.defaultSets !== undefined ? `${exercise.defaultSets} × ${exercise.defaultReps ?? "?"}` : null,
        ].filter(Boolean).join(" · ");

        const setting = new Setting(listContainer).setName(exercise.name).setDesc(desc);

        setting.addButton((btn) =>
          btn.setButtonText("Edit").onClick(() => {
            new ExerciseDefinitionModal(app, plugin, () => { void renderList(); }, exercise).open();
          })
        );

        if (exercise.filePath) {
          setting.addButton((btn) =>
            btn.setButtonText("Open note").onClick(() => {
              void app.workspace.openLinkText(exercise.filePath!, "", false);
            })
          );
        }

        setting.addButton((btn) =>
          btn.setButtonText("Delete").setWarning().onClick(() => {
            void (async () => {
              if (!exercise.filePath) {
                new Notice("Cannot delete: file path unknown.");
                return;
              }
              const file = app.vault.getAbstractFileByPath(exercise.filePath);
              if (!(file instanceof TFile)) {
                new Notice("Exercise note not found.");
                return;
              }
              await app.fileManager.trashFile(file);
              new Notice(`Deleted: ${exercise.name}`);
              await renderList();
            })();
          })
        );
      }
    };

    await renderList();

    new Setting(containerEl).addButton((btn) =>
      btn.setButtonText("Add exercise").setCta().onClick(() => {
        new ExerciseDefinitionModal(app, plugin, () => { void renderList(); }).open();
      })
    );
  }
}
