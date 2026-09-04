import { App, Notice, TFile } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { ExerciseDefinitionModal } from "../modals/ExerciseDefinitionModal";
import { CatalogBrowseModal } from "../modals/CatalogBrowseModal";
import { EXERCISE_TYPE_LABELS } from "../utils/exerciseTypeUtils";
import {
  createActionBar,
  createBackButton,
  createButton,
  createEmptyState,
  createHint,
  createIconButton,
  createList,
  createRow,
  createSectionLabel,
  renderHeader,
} from "../utils/uiKit";

export class ExerciseSettingsPage {
  async render(
    containerEl: HTMLElement,
    app: App,
    plugin: WorkoutTrackerPlugin,
    onBack: () => void
  ): Promise<void> {
    containerEl.empty();
    containerEl.addClass("wj-settings");

    createBackButton(containerEl, "Back to settings", () => onBack());
    renderHeader(containerEl, {
      title: "Exercise library",
      subtitle: "Every exercise is a note in your vault",
    });

    const listContainer = containerEl.createDiv();

    const renderList = async () => {
      listContainer.empty();

      if (!plugin.settings.exerciseLibraryFolder) {
        createEmptyState(listContainer, {
          title: "No library folder set",
          body: "Pick an exercise library folder in the general settings first.",
        });
        return;
      }

      const exercises = await plugin.definitionService.loadExerciseDefinitions();
      exercises.sort((a, b) => a.name.localeCompare(b.name));

      if (exercises.length === 0) {
        createEmptyState(listContainer, {
          title: "No exercises yet",
          body: "Add one by hand, or pick from the bundled catalog.",
        });
        return;
      }

      createSectionLabel(
        listContainer,
        `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`
      );
      const list = createList(listContainer);

      for (const exercise of exercises) {
        const meta = [
          exercise.muscleGroups.length ? exercise.muscleGroups.join(", ") : null,
          exercise.defaultSets !== undefined
            ? `${exercise.defaultSets} × ${exercise.defaultReps ?? "?"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

        const { actions } = createRow(list, {
          title: exercise.name,
          meta,
          chips: [{ text: EXERCISE_TYPE_LABELS[exercise.type] }],
          onClick: exercise.filePath
            ? () => {
                void app.workspace.openLinkText(exercise.filePath!, "", false);
              }
            : undefined,
        });

        createIconButton(actions, "pencil", "Edit exercise", () => {
          new ExerciseDefinitionModal(
            app,
            plugin,
            () => {
              void renderList();
            },
            exercise
          ).open();
        });

        if (exercise.filePath) {
          createIconButton(actions, "file-text", "Open note", () => {
            void app.workspace.openLinkText(exercise.filePath!, "", false);
          });
        }

        createIconButton(
          actions,
          "trash-2",
          "Delete exercise",
          () => {
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
          },
          { danger: true }
        );
      }

      createHint(listContainer, "Tap a row to open its note.");
    };

    await renderList();

    const actions = createActionBar(containerEl);
    createButton(actions, {
      label: "Add exercise",
      variant: "primary",
      icon: "plus",
      onClick: () => {
        new ExerciseDefinitionModal(app, plugin, () => {
          void renderList();
        }).open();
      },
    });
    createButton(actions, {
      label: "Browse catalog",
      variant: "secondary",
      icon: "library",
      onClick: () => {
        new CatalogBrowseModal(app, plugin, () => {
          void renderList();
        }).open();
      },
    });
  }
}
