import { App, Modal, Setting } from "obsidian";
import { RoutineDefinition, WorkoutPlanDefinition } from "../types";

/**
 * Two-step picker: first the plan names, then the routines inside the chosen
 * plan.
 */
export class PlanSelectionModal extends Modal {
  plans: WorkoutPlanDefinition[];
  routinesById: Map<string, RoutineDefinition>;
  onSelect: (plan: WorkoutPlanDefinition, routine: RoutineDefinition) => void;
  private selectedPlan: WorkoutPlanDefinition | null = null;

  constructor(
    app: App,
    plans: WorkoutPlanDefinition[],
    routines: RoutineDefinition[],
    onSelect: (plan: WorkoutPlanDefinition, routine: RoutineDefinition) => void
  ) {
    super(app);
    this.plans = plans;
    this.routinesById = new Map(routines.map((routine) => [routine.id, routine]));
    this.onSelect = onSelect;
  }

  onOpen() {
    // A single plan has nothing to choose from — go straight to its routines.
    if (this.plans.length === 1) {
      this.selectedPlan = this.plans[0];
    }
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    if (this.selectedPlan) {
      this.renderRoutineStep(this.selectedPlan);
      return;
    }
    this.renderPlanStep();
  }

  private renderPlanStep() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Start workout from plan" });

    if (!this.plans.length) {
      contentEl.createEl("p", { text: "No workout plan notes found." });
      return;
    }

    this.plans.forEach((plan) => {
      const routineCount = plan.routines.length;
      new Setting(contentEl)
        .setName(plan.name)
        .setDesc(`${routineCount} routine${routineCount === 1 ? "" : "s"}`)
        .addButton((btn) =>
          btn
            .setButtonText("Select")
            .setCta()
            .onClick(() => {
              this.selectedPlan = plan;
              this.render();
            })
        );
    });
  }

  private renderRoutineStep(plan: WorkoutPlanDefinition) {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: plan.name });

    // Only offer a way back when there was actually a plan list to return to.
    if (this.plans.length > 1) {
      new Setting(contentEl).addButton((btn) =>
        btn.setButtonText("← Back to plans").onClick(() => {
          this.selectedPlan = null;
          this.render();
        })
      );
    }

    if (!plan.routines.length) {
      contentEl.createEl("p", { text: "No routines configured." });
      return;
    }

    plan.routines.forEach((entry) => {
      const routine = this.routinesById.get(entry.routineId);
      const details: string[] = [];
      if (routine) {
        details.push(
          `${routine.exercises.length} exercise${routine.exercises.length === 1 ? "" : "s"}`
        );
        if (routine.isCircle) details.push("circuit");
      } else {
        details.push("Routine note not found");
      }
      if (entry.notes) details.push(entry.notes);

      new Setting(contentEl)
        .setName(entry.day ? `${entry.day}: ${entry.routineName}` : entry.routineName)
        .setDesc(details.join(" • "))
        .addButton((btn) =>
          btn
            .setButtonText("Start")
            .setCta()
            .setDisabled(!routine)
            .onClick(() => {
              if (!routine) return;
              this.onSelect(plan, routine);
              this.close();
            })
        );
    });
  }
}
