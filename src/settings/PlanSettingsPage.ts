import { App, Notice, Setting, TFile } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { WorkoutPlanDefinition, RoutineDefinition } from "../types";
import { PlanBuilderModal } from "./PlanBuilderModal";

export class PlanSettingsPage {
  async render(containerEl: HTMLElement, app: App, plugin: WorkoutTrackerPlugin, onBack: () => void): Promise<void> {
    containerEl.empty();

    new Setting(containerEl)
      .addButton((btn) =>
        btn.setButtonText("← General Settings").onClick(() => {
          onBack();
        })
      );

    containerEl.createEl("h2", { text: "Workout Plans" });
    containerEl.createEl("p", {
      text: "Plans combine multiple routines into a training program. Each plan is stored as a note.",
      cls: "setting-item-description",
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

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Create New Plan")
        .setCta()
        .onClick(async () => {
          const routines = await plugin.definitionService.loadRoutineDefinitions();
          new PlanBuilderModal(app, plugin, routines, async () => {
            await renderList();
          }).open();
        })
    );
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
      container.createEl("p", {
        text: "No workout plan notes found.",
        cls: "setting-item-description",
      });
      return;
    }

    plans.forEach((plan) => {
      const routineCount = plan.routines.length;
      const setting = new Setting(container)
        .setName(plan.name)
        .setDesc(
          `${routineCount} routine${routineCount !== 1 ? "s" : ""}` +
            (plan.routines.length > 0
              ? ` · ${plan.routines.map((r) => r.routineName).join(", ")}`
              : "")
        );

      if (plan.filePath) {
        setting.addButton((btn) =>
          btn.setButtonText("Open Note").onClick(async () => {
            await app.workspace.openLinkText(plan.filePath!, "", false);
          })
        );
      }

      setting.addButton((btn) =>
        btn
          .setButtonText("Delete")
          .setWarning()
          .onClick(async () => {
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
          })
      );
    });
  }
}
