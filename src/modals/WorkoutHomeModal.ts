import { App, Modal, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { RoutineDefinition, WorkoutPlanDefinition } from "../types";
import { WorkoutStatsModal } from "./WorkoutStatsModal";

/**
 * The plugin's landing page: resume or start a workout, then every routine
 * listed under the plan it belongs to.
 */
export class WorkoutHomeModal extends Modal {
  private plugin: WorkoutTrackerPlugin;

  constructor(app: App, plugin: WorkoutTrackerPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("workout-home-modal");
    contentEl.createEl("h2", { text: "Workout Journal" });
    contentEl.createEl("p", {
      text: "Loading routines…",
      cls: "setting-item-description",
    });
    void this.renderContent();
  }

  private async renderContent(): Promise<void> {
    const [plans, routines] = await Promise.all([
      this.plugin.definitionService.loadPlanDefinitions(),
      this.plugin.definitionService.loadRoutineDefinitions(),
    ]);

    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Workout Journal" });

    this.renderActions(contentEl);
    this.renderLibrary(contentEl, plans, routines);
    this.renderFooter(contentEl);
  }

  private renderActions(container: HTMLElement): void {
    const activeSession = this.plugin.activeSession;
    if (activeSession) {
      new Setting(container)
        .setName("Resume session")
        .setDesc(`Continue the unfinished session "${activeSession.name}"`)
        .addButton((btn) =>
          btn.setButtonText("Resume").setCta().onClick(() => {
            this.close();
            void this.plugin.openActiveSessionView();
          })
        );
    }

    const actions = container.createDiv({ cls: "workout-home-actions" });
    const emptyBtn = actions.createEl("button", {
      text: "＋ Start empty workout",
      cls: "workout-home-primary-btn",
    });
    emptyBtn.onclick = () => {
      this.close();
      void this.plugin.startQuickLogSession(true);
    };
  }

  private renderLibrary(
    container: HTMLElement,
    plans: WorkoutPlanDefinition[],
    routines: RoutineDefinition[]
  ): void {
    const routinesById = new Map(routines.map((routine) => [routine.id, routine]));
    const claimed = new Set<string>();

    for (const plan of plans) {
      const section = container.createDiv({ cls: "workout-home-section" });
      const heading = section.createDiv({ cls: "workout-home-section-header" });
      heading.setAttr("role", "heading");
      heading.setAttr("aria-level", "3");
      heading.createSpan({ text: plan.name, cls: "workout-home-section-title" });
      heading.createSpan({
        text: `${plan.routines.length} routine${plan.routines.length === 1 ? "" : "s"}`,
        cls: "workout-home-section-count",
      });

      if (!plan.routines.length) {
        section.createEl("p", {
          text: "No routines in this plan yet.",
          cls: "setting-item-description",
        });
        continue;
      }

      for (const entry of plan.routines) {
        const routine = routinesById.get(entry.routineId);
        if (routine) claimed.add(routine.id);
        this.renderRoutineRow(section, routine, entry.day, plan);
      }
    }

    // Routines that no plan references still need a way in.
    const orphans = routines.filter((routine) => !claimed.has(routine.id));
    if (orphans.length) {
      const section = container.createDiv({ cls: "workout-home-section" });
      const heading = section.createDiv({ cls: "workout-home-section-header" });
      heading.setAttr("role", "heading");
      heading.setAttr("aria-level", "3");
      heading.createSpan({
        text: plans.length ? "Other routines" : "Routines",
        cls: "workout-home-section-title",
      });
      heading.createSpan({
        text: `${orphans.length}`,
        cls: "workout-home-section-count",
      });
      for (const routine of orphans) {
        this.renderRoutineRow(section, routine);
      }
    }

    if (!plans.length && !routines.length) {
      container.createEl("p", {
        text: "No routine or plan notes yet. Create one from the command palette or the plugin settings.",
        cls: "setting-item-description",
      });
    }
  }

  private renderRoutineRow(
    container: HTMLElement,
    routine: RoutineDefinition | undefined,
    day?: string,
    plan?: WorkoutPlanDefinition
  ): void {
    const row = container.createDiv({ cls: "workout-home-routine" });

    const info = row.createDiv({ cls: "workout-home-routine-info" });
    info.createSpan({
      text: day ? `${day}: ${routine?.name ?? "Missing routine"}` : routine?.name ?? "Missing routine",
      cls: "workout-home-routine-name",
    });

    const details: string[] = [];
    if (routine) {
      details.push(
        `${routine.exercises.length} exercise${routine.exercises.length === 1 ? "" : "s"}`
      );
      if (routine.isCircle) details.push("circuit");
      else if (routine.estimatedDuration) details.push(`~${routine.estimatedDuration} min`);
    } else {
      details.push("Routine note not found");
    }
    info.createSpan({
      text: details.join(" · "),
      cls: "workout-home-routine-meta",
    });

    const startBtn = row.createEl("button", {
      text: "Start",
      cls: "workout-home-start-btn",
    });
    startBtn.disabled = !routine;
    startBtn.onclick = () => {
      if (!routine) return;
      this.close();
      void this.plugin.startSessionFromRoutine(routine, true, plan);
    };
  }

  private renderFooter(container: HTMLElement): void {
    new Setting(container)
      .addButton((btn) =>
        btn.setButtonText("Statistics").onClick(() => {
          this.close();
          new WorkoutStatsModal(this.app, this.plugin).open();
        })
      )
      .addButton((btn) =>
        btn.setButtonText("New routine").onClick(() => {
          this.close();
          void this.plugin.createRoutineNoteFromPrompt();
        })
      )
      .addButton((btn) =>
        btn.setButtonText("New plan").onClick(() => {
          this.close();
          void this.plugin.createPlanNoteFromPrompt();
        })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
