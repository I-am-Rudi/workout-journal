import WorkoutTrackerPlugin from "main";
import { App, Modal, Setting } from "obsidian";
import { WorkoutModal } from "./WorkoutModal";
import { QuickWorkoutModal } from "./QuickWorkoutModal";
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

    new Setting(contentEl)
      .setName("Add New Workout")
      .setDesc("Create a detailed workout with multiple exercises")
      .addButton((btn) =>
        btn.setButtonText("Add Workout").onClick(() => {
          this.close();
          new WorkoutModal(this.app, this.plugin).open();
        })
      );

    new Setting(contentEl)
      .setName("Quick Workout")
      .setDesc("Log a workout using a template")
      .addButton((btn) =>
        btn.setButtonText("Quick Log").onClick(() => {
          this.close();
          new QuickWorkoutModal(this.app, this.plugin).open();
        })
      );

    new Setting(contentEl)
      .setName("View Statistics")
      .setDesc("See your workout progress and statistics")
      .addButton((btn) =>
        btn.setButtonText("View Stats").onClick(() => {
          this.close();
          new WorkoutStatsModal(this.app, this.plugin).open();
        })
      );

    new Setting(contentEl)
      .setName("Start From Routine")
      .setDesc("Load previous targets and track a routine session")
      .addButton((btn) =>
        btn.setButtonText("Choose Routine").onClick(async () => {
          this.close();
          const routines = await this.plugin.definitionService.loadRoutineDefinitions();
          new RoutineSelectionModal(this.app, routines, async (routine) => {
            await this.plugin.startSessionFromRoutine(routine, true);
          }).open();
        })
      );

    new Setting(contentEl)
      .setName("Start From Plan")
      .setDesc("Choose a routine from a workout plan")
      .addButton((btn) =>
        btn.setButtonText("Choose Plan").onClick(async () => {
          this.close();
          const [plans, routines] = await Promise.all([
            this.plugin.definitionService.loadPlanDefinitions(),
            this.plugin.definitionService.loadRoutineDefinitions(),
          ]);
          new PlanSelectionModal(this.app, plans, routines, async (plan, routine) => {
            await this.plugin.startSessionFromRoutine(routine, true, plan);
          }).open();
        })
      );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
