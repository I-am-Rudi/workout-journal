import { App, Modal } from "obsidian";
import { RoutineDefinition, WorkoutPlanDefinition } from "../types";
import {
  createBackButton,
  createButton,
  createEmptyState,
  createList,
  createRow,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

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
    markPluginModal(this.contentEl);
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
    renderHeader(contentEl, {
      title: "Start from plan",
      subtitle: "Pick a plan, then the routine inside it",
    });

    if (!this.plans.length) {
      createEmptyState(contentEl, {
        title: "No workout plans yet",
        body: "Plans group routines into a training program.",
      });
      return;
    }

    const list = createList(contentEl);
    this.plans.forEach((plan) => {
      const routineCount = plan.routines.length;
      const { actions } = createRow(list, {
        title: plan.name,
        meta: `${routineCount} routine${routineCount === 1 ? "" : "s"}`,
        onClick: () => {
          this.selectedPlan = plan;
          this.render();
        },
      });
      createButton(actions, {
        label: "Open",
        variant: "secondary",
        onClick: () => {
          this.selectedPlan = plan;
          this.render();
        },
      });
    });
  }

  private renderRoutineStep(plan: WorkoutPlanDefinition) {
    const { contentEl } = this;
    contentEl.empty();

    // Only offer a way back when there was actually a plan list to return to.
    if (this.plans.length > 1) {
      createBackButton(contentEl, "All plans", () => {
        this.selectedPlan = null;
        this.render();
      });
    }

    renderHeader(contentEl, {
      title: plan.name,
      subtitle: "Pick the routine you are training today",
    });

    if (!plan.routines.length) {
      createEmptyState(contentEl, {
        title: "No routines in this plan",
        body: "Add routines to the plan note to start them from here.",
      });
      return;
    }

    const list = createList(contentEl);
    plan.routines.forEach((entry) => {
      const routine = this.routinesById.get(entry.routineId);
      const details: string[] = [];
      if (routine) {
        details.push(
          `${routine.exercises.length} exercise${routine.exercises.length === 1 ? "" : "s"}`
        );
      } else {
        details.push("Routine note not found");
      }
      if (entry.notes) details.push(entry.notes);

      const chips: Array<{ text: string; accent?: boolean }> = [];
      if (entry.day) chips.push({ text: entry.day });
      if (routine?.isCircle) chips.push({ text: "Circuit", accent: true });

      const { actions } = createRow(list, {
        title: entry.routineName,
        meta: details.join(" · "),
        chips,
        muted: !routine,
      });
      createButton(actions, {
        label: "Start",
        variant: "secondary",
        disabled: !routine,
        onClick: () => {
          if (!routine) return;
          this.onSelect(plan, routine);
          this.close();
        },
      });
    });
  }
}
