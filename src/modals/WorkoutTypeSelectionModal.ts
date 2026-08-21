import WorkoutTrackerPlugin from "../plugin";
import { App, Modal, Setting } from "obsidian";
import { WorkoutStatsModal } from "./WorkoutStatsModal";
import { PlanSelectionModal } from "./PlanSelectionModal";
import { RoutineSelectionModal } from "./RoutineSelectionModal";

export class WorkoutTypeSelectionModal extends Modal {
  plugin: WorkoutTrackerPlugin;
  constructor(app: App, plugin: WorkoutTrackerPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Workout Journal" });

    const activeSession = this.plugin.activeSession;
    if (activeSession) {
      new Setting(contentEl)
        .setName("Resume session")
        .setDesc(`Continue the unfinished session "${activeSession.name}"`)
        .addButton((btn) =>
          btn.setButtonText("Resume").setCta().onClick(() => {
            this.close();
            void this.plugin.openActiveSessionView();
          })
        );
    }

    new Setting(contentEl)
      .setName("Quick log")
      .setDesc("Open an active session with an empty untitled routine")
      .addButton((btn) =>
        btn.setButtonText("Quick log").onClick(() => {
          this.close();
          void this.plugin.startQuickLogSession(true);
        })
      );

    new Setting(contentEl)
      .setName("View statistics")
      .setDesc("See your workout progress and statistics")
      .addButton((btn) =>
        btn.setButtonText("View stats").onClick(() => {
          this.close();
          new WorkoutStatsModal(this.app, this.plugin).open();
        })
      );

    new Setting(contentEl)
      .setName("Start from routine")
      .setDesc("Load previous targets and track a routine session")
      .addButton((btn) =>
        btn.setButtonText("Choose routine").onClick(() => {
          this.close();
          void (async () => {
            const routines = await this.plugin.definitionService.loadRoutineDefinitions();
            new RoutineSelectionModal(this.app, routines, (routine) => {
              void this.plugin.startSessionFromRoutine(routine, true);
            }).open();
          })();
        })
      );

    new Setting(contentEl)
      .setName("Start from plan")
      .setDesc("Choose a routine from a workout plan")
      .addButton((btn) =>
        btn.setButtonText("Choose plan").onClick(() => {
          this.close();
          void (async () => {
            const [plans, routines] = await Promise.all([
              this.plugin.definitionService.loadPlanDefinitions(),
              this.plugin.definitionService.loadRoutineDefinitions(),
            ]);
            new PlanSelectionModal(this.app, plans, routines, (plan, routine) => {
              void this.plugin.startSessionFromRoutine(routine, true, plan);
            }).open();
          })();
        })
      );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
