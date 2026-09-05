import { App, Notice, TFile } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { WorkoutPlanDefinition, RoutineDefinition } from "../types";
import { PlanBuilderModal } from "./PlanBuilderModal";
import {
  createActionBar,
  createBackButton,
  createButton,
  createEmptyState,
  createHint,
  createIconButton,
  createList,
  createRow,
  renderHeader,
} from "../utils/uiKit";

export class PlanSettingsPage {
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
      title: "Workout plans",
      subtitle: "Plans combine routines into a training program",
    });

    const listContainer = containerEl.createDiv();

    const renderList = async () => {
      const [plans, routines] = await Promise.all([
        plugin.definitionService.loadPlanDefinitions(),
        plugin.definitionService.loadRoutineDefinitions(),
      ]);
      this.renderPlanList(listContainer, app, plugin, plans, routines, renderList);
    };

    await renderList();

    const actions = createActionBar(containerEl);
    createButton(actions, {
      label: "Create plan",
      variant: "primary",
      icon: "plus",
      onClick: () => {
        void (async () => {
          const routines = await plugin.definitionService.loadRoutineDefinitions();
          new PlanBuilderModal(app, plugin, routines, () => {
            void renderList();
          }).open();
        })();
      },
    });
  }

  private renderPlanList(
    container: HTMLElement,
    app: App,
    plugin: WorkoutTrackerPlugin,
    plans: WorkoutPlanDefinition[],
    routines: RoutineDefinition[],
    onRefresh: () => Promise<void>
  ): void {
    container.empty();

    if (plans.length === 0) {
      createEmptyState(container, {
        title: "No workout plans yet",
        body: "Create one to group your routines into a program.",
      });
      return;
    }

    const list = createList(container);

    plans.forEach((plan) => {
      const routineCount = plan.routines.length;
      const meta = [
        `${routineCount} routine${routineCount === 1 ? "" : "s"}`,
        routineCount > 0 ? plan.routines.map((r) => r.routineName).join(", ") : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const { actions } = createRow(list, {
        title: plan.name,
        meta,
        onClick: plan.filePath
          ? () => {
              void app.workspace.openLinkText(plan.filePath, "", false);
            }
          : undefined,
      });

      createIconButton(actions, "pencil", "Edit plan", () => {
        new PlanBuilderModal(
          app,
          plugin,
          routines,
          () => {
            void onRefresh();
          },
          plan
        ).open();
      });

      if (plan.filePath) {
        createIconButton(actions, "file-text", "Open note", () => {
          void app.workspace.openLinkText(plan.filePath, "", false);
        });
      }

      createIconButton(
        actions,
        "trash-2",
        "Delete plan",
        () => {
          void (async () => {
            if (!plan.filePath) {
              new Notice("Cannot delete: plan file path is unknown.");
              return;
            }
            const file = app.vault.getAbstractFileByPath(plan.filePath);
            if (!(file instanceof TFile)) {
              new Notice("Plan note file not found.");
              return;
            }
            await app.fileManager.trashFile(file);
            new Notice(`Deleted plan: ${plan.name}`);
            await onRefresh();
          })();
        },
        { danger: true }
      );
    });

    createHint(container, "Tap a row to open its note.");
  }
}
