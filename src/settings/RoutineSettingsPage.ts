import { App, Notice, TFile } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { RoutineBuilderModal } from "./RoutineBuilderModal";
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

export class RoutineSettingsPage {
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
      title: "Routines",
      subtitle: "The workouts you start a session from",
    });

    const listContainer = containerEl.createDiv();

    const renderList = async () => {
      listContainer.empty();

      if (!plugin.settings.routinesFolder) {
        createEmptyState(listContainer, {
          title: "No routines folder set",
          body: "Pick a routines folder in the general settings first.",
        });
        return;
      }

      const routines = await plugin.definitionService.loadRoutineDefinitions();
      routines.sort((a, b) => a.name.localeCompare(b.name));

      if (routines.length === 0) {
        createEmptyState(listContainer, {
          title: "No routines yet",
          body: "Add one below and fill it with exercises.",
        });
        return;
      }

      createSectionLabel(
        listContainer,
        `${routines.length} routine${routines.length === 1 ? "" : "s"}`
      );
      const list = createList(listContainer);

      for (const routine of routines) {
        const count = routine.exercises.length;
        const meta = [
          `${count} exercise${count === 1 ? "" : "s"}`,
          count > 0 ? routine.exercises.map((e) => e.exerciseName).join(", ") : null,
        ]
          .filter(Boolean)
          .join(" · ");

        const { actions } = createRow(list, {
          title: routine.name,
          meta,
          chips: routine.isCircle ? [{ text: "Circuit", accent: true }] : undefined,
          onClick: routine.filePath
            ? () => {
                void app.workspace.openLinkText(routine.filePath!, "", false);
              }
            : undefined,
        });

        createIconButton(actions, "pencil", "Edit details", () => {
          new RoutineBuilderModal(
            app,
            plugin,
            () => {
              void renderList();
            },
            { existing: routine }
          ).open();
        });

        if (routine.filePath) {
          createIconButton(actions, "list-checks", "Edit sets", () => {
            const file = app.vault.getAbstractFileByPath(routine.filePath!);
            if (file instanceof TFile) void plugin.openRoutineEditor(file);
          });

          createIconButton(actions, "file-text", "Open note", () => {
            void app.workspace.openLinkText(routine.filePath!, "", false);
          });
        }

        createIconButton(
          actions,
          "trash-2",
          "Delete routine",
          () => {
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
          },
          { danger: true }
        );
      }

      createHint(listContainer, "Tap a row to open its note.");
    };

    await renderList();

    const actions = createActionBar(containerEl);
    createButton(actions, {
      label: "Add routine",
      variant: "primary",
      icon: "plus",
      onClick: () => {
        void plugin.createRoutineNoteFromPrompt(false, () => {
          void renderList();
        });
      },
    });
    createButton(actions, {
      label: "Add circuit",
      variant: "secondary",
      icon: "timer",
      onClick: () => {
        void plugin.createRoutineNoteFromPrompt(true, () => {
          void renderList();
        });
      },
    });
  }
}
