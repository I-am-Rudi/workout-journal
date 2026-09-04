import { App, Modal, Notice, setIcon } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import {
  RoutineDefinition,
  WorkoutPlanDefinition,
  WorkoutPlanRoutineEntry,
} from "../types";
import { WorkoutStatsModal } from "./WorkoutStatsModal";
import { ExerciseLibraryModal } from "./ExerciseLibraryModal";
import { WorkoutHistoryModal } from "./WorkoutHistoryModal";
import { RoutineBuilderModal } from "../settings/RoutineBuilderModal";
import { PlanBuilderModal } from "../settings/PlanBuilderModal";
import {
  formatElapsed,
  getSessionElapsedMs,
  hasSessionTimer,
  isSessionTimerRunning,
} from "../utils/sessionTimerUtils";
import {
  createButton,
  createEmptyActions,
  createEmptyState,
  createHint,
  createIconButton,
  createList,
  createRow,
  createSection,
  createSectionHeader,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

/**
 * The plugin's landing page: resume or start a workout, then the library —
 * plans as collapsible folders holding their routines, loose routines below.
 */
export class WorkoutHomeModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private plans: WorkoutPlanDefinition[] = [];
  private routines: RoutineDefinition[] = [];
  private bodyEl: HTMLElement | null = null;

  constructor(app: App, plugin: WorkoutTrackerPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("wj-modal-narrow");
    contentEl.empty();
    markPluginModal(contentEl);

    renderHeader(contentEl, {
      title: "Workout journal",
      subtitle: "Start a session or open your library",
    });

    this.bodyEl = contentEl.createDiv({ cls: "workout-home-body" });
    createHint(this.bodyEl, "Loading library…");

    void this.refresh();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /** Reload the definitions from disk and rebuild the body. */
  private async refresh(): Promise<void> {
    const [plans, routines] = await Promise.all([
      this.plugin.definitionService.loadPlanDefinitions(),
      this.plugin.definitionService.loadRoutineDefinitions(),
    ]);
    this.plans = plans;
    this.routines = routines;
    this.renderBody();
  }

  private renderBody(): void {
    const body = this.bodyEl;
    if (!body) return;
    body.empty();

    this.renderQuickStart(body);

    const routinesById = new Map(this.routines.map((r) => [r.id, r]));
    const claimed = new Set<string>();
    for (const plan of this.plans) {
      for (const entry of plan.routines) {
        if (routinesById.has(entry.routineId)) claimed.add(entry.routineId);
      }
    }
    const loose = this.routines.filter((routine) => !claimed.has(routine.id));

    if (!this.plans.length && !this.routines.length) {
      this.renderEmptyLibrary(body);
      return;
    }

    this.renderPlans(body, routinesById);
    this.renderLooseRoutines(body, loose);
  }

  // ── Quick start ──────────────────────────────────────────────────────────

  private renderQuickStart(container: HTMLElement): void {
    const section = container.createDiv({ cls: "workout-home-quickstart" });

    const activeSession = this.plugin.activeSession;
    if (activeSession) {
      const card = section.createDiv({ cls: "workout-home-resume" });
      const info = card.createDiv({ cls: "workout-home-resume-info" });
      info.createDiv({ text: "In progress", cls: "workout-home-resume-label" });
      info.createDiv({
        text: activeSession.name,
        cls: "workout-home-resume-name",
      });
      const exerciseCount = activeSession.exercises.length;
      const elapsed = hasSessionTimer(activeSession)
        ? ` · ${formatElapsed(getSessionElapsedMs(activeSession))}${
            isSessionTimerRunning(activeSession) ? "" : " (paused)"
          }`
        : "";
      info.createDiv({
        text: `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"} · ${activeSession.date}${elapsed}`,
        cls: "workout-home-resume-meta",
      });
      createButton(card, {
        label: "Resume",
        variant: "accent",
        onClick: () => {
          this.close();
          void this.plugin.openActiveSessionView();
        },
      });
    }

    createButton(section, {
      label: "Start empty workout",
      variant: "accent",
      icon: "plus",
      block: true,
      onClick: () => {
        this.close();
        void this.plugin.startQuickLogSession(true);
      },
    });

    this.renderQuickLinks(section);
  }

  /**
   * The three places the dashboard leads to besides a workout: the exercise
   * library, the log of past workouts, and the numbers over all of them.
   */
  private renderQuickLinks(container: HTMLElement): void {
    const links = container.createDiv({ cls: "workout-home-links" });

    createButton(links, {
      label: "Exercises",
      variant: "secondary",
      icon: "dumbbell",
      onClick: () =>
        new ExerciseLibraryModal(this.app, this.plugin, () => this.close()).open(),
    });
    createButton(links, {
      label: "History",
      variant: "secondary",
      icon: "history",
      onClick: () =>
        new WorkoutHistoryModal(this.app, this.plugin, () => this.close()).open(),
    });
    createButton(links, {
      label: "Stats",
      variant: "secondary",
      icon: "bar-chart",
      onClick: () => {
        this.close();
        new WorkoutStatsModal(this.app, this.plugin).open();
      },
    });
  }

  private renderEmptyLibrary(container: HTMLElement): void {
    const empty = createEmptyState(container, {
      title: "Your library is empty",
      body: "Routines hold the exercises you repeat; plans group routines into a week.",
    });
    const actions = createEmptyActions(empty);
    createButton(actions, {
      label: "New routine",
      variant: "secondary",
      icon: "plus",
      onClick: () => this.openRoutineBuilder(),
    });
    createButton(actions, {
      label: "New plan",
      variant: "quiet",
      icon: "plus",
      onClick: () => this.openPlanBuilder(),
    });
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  private renderPlans(
    container: HTMLElement,
    routinesById: Map<string, RoutineDefinition>
  ): void {
    const section = createSection(container);
    this.renderSectionHeader(section, "Plans", "New plan", () =>
      this.openPlanBuilder()
    );

    if (!this.plans.length) {
      createHint(section, "No plans yet. A plan groups routines into a week.");
      return;
    }

    for (const plan of this.plans) {
      this.renderPlanCard(section, plan, routinesById);
    }
  }

  private renderPlanCard(
    container: HTMLElement,
    plan: WorkoutPlanDefinition,
    routinesById: Map<string, RoutineDefinition>
  ): void {
    const card = container.createDiv({ cls: "workout-home-plan" });
    const header = card.createDiv({ cls: "workout-home-plan-header" });

    const toggle = header.createEl("button", {
      cls: "workout-home-plan-toggle",
    });
    const chevron = toggle.createSpan({ cls: "workout-home-plan-chevron" });
    const titles = toggle.createSpan({ cls: "workout-home-plan-titles" });
    titles.createSpan({ text: plan.name, cls: "workout-home-plan-name" });
    titles.createSpan({
      text: `${plan.routines.length} routine${plan.routines.length === 1 ? "" : "s"}`,
      cls: "workout-home-plan-count",
    });

    const actions = header.createDiv({ cls: "workout-home-plan-actions" });
    this.createIconButton(actions, "plus", "Add routine to this plan", () =>
      this.openRoutineBuilder(plan)
    );
    this.createIconButton(actions, "pencil", "Edit plan", () =>
      this.openPlanBuilder(plan)
    );

    const body = card.createDiv({ cls: "workout-home-plan-body" });
    if (!plan.routines.length) {
      createHint(body, "No routines in this plan yet.");
    } else {
      for (const entry of plan.routines) {
        this.renderRoutineRow(body, routinesById.get(entry.routineId), entry, plan);
      }
    }

    const apply = (expanded: boolean) => {
      card.toggleClass("is-expanded", expanded);
      body.toggleClass("is-hidden", !expanded);
      setIcon(chevron, expanded ? "chevron-down" : "chevron-right");
      toggle.setAttr("aria-expanded", String(expanded));
    };
    apply(this.isExpanded(plan.id));

    toggle.onclick = () => {
      const next = !this.isExpanded(plan.id);
      apply(next);
      void this.setExpanded(plan.id, next);
    };
  }

  private isExpanded(planId: string): boolean {
    return this.plugin.settings.homeExpandedPlans?.[planId] === true;
  }

  private async setExpanded(planId: string, expanded: boolean): Promise<void> {
    if (!this.plugin.settings.homeExpandedPlans) {
      this.plugin.settings.homeExpandedPlans = {};
    }
    this.plugin.settings.homeExpandedPlans[planId] = expanded;
    await this.plugin.saveSettings();
  }

  // ── Loose routines ───────────────────────────────────────────────────────

  private renderLooseRoutines(
    container: HTMLElement,
    routines: RoutineDefinition[]
  ): void {
    const section = createSection(container);
    this.renderSectionHeader(
      section,
      this.plans.length ? "Other routines" : "Routines",
      "New routine",
      () => this.openRoutineBuilder()
    );

    if (!routines.length) {
      createHint(section, "Every routine belongs to a plan.");
      return;
    }

    const list = createList(section);
    for (const routine of routines) {
      this.renderRoutineRow(list, routine);
    }
  }

  // ── Shared pieces ────────────────────────────────────────────────────────

  private renderSectionHeader(
    container: HTMLElement,
    title: string,
    addTooltip: string,
    onAdd: () => void
  ): void {
    const { header } = createSectionHeader(container, title);
    this.createIconButton(header, "plus", addTooltip, onAdd);
  }

  private renderRoutineRow(
    container: HTMLElement,
    routine: RoutineDefinition | undefined,
    entry?: WorkoutPlanRoutineEntry,
    plan?: WorkoutPlanDefinition
  ): void {
    const details: string[] = [];
    if (routine) {
      details.push(
        `${routine.exercises.length} exercise${routine.exercises.length === 1 ? "" : "s"}`
      );
      if (!routine.isCircle && routine.estimatedDuration) {
        details.push(`~${routine.estimatedDuration} min`);
      }
    } else {
      details.push("Routine note not found");
    }

    const { actions } = createRow(container, {
      title: routine?.name ?? entry?.routineName ?? "Missing routine",
      meta: details.join(" · "),
      leadingChips: entry?.day ? [{ text: entry.day }] : undefined,
      chips: routine?.isCircle ? [{ text: "Circuit", accent: true }] : undefined,
    });

    if (routine) {
      this.createIconButton(actions, "pencil", "Edit routine", () =>
        this.openRoutineBuilder(undefined, routine)
      );
    }
    createButton(actions, {
      label: "Start",
      variant: "secondary",
      disabled: !routine,
      onClick: () => {
        if (!routine) return;
        this.close();
        void this.plugin.startSessionFromRoutine(routine, true, plan);
      },
    });
  }

  /**
   * The kit's icon button, with the click kept off the row behind it — plan
   * headers and routine rows both have their own click targets.
   */
  private createIconButton(
    container: HTMLElement,
    icon: string,
    tooltip: string,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = createIconButton(container, icon, tooltip, onClick);
    btn.onclick = (event) => {
      event.stopPropagation();
      onClick();
    };
    return btn;
  }

  // ── Creation flows ───────────────────────────────────────────────────────

  /**
   * Open the routine editor. When `plan` is given the saved routine is appended
   * to that plan, so the plus on a plan card creates a routine inside it.
   */
  private openRoutineBuilder(
    plan?: WorkoutPlanDefinition,
    existing?: RoutineDefinition
  ): void {
    new RoutineBuilderModal(
      this.app,
      this.plugin,
      (routine) => {
        void (async () => {
          if (plan && routine) await this.addRoutineToPlan(plan, routine);
          await this.refresh();
        })();
      },
      { existing }
    ).open();
  }

  private openPlanBuilder(existing?: WorkoutPlanDefinition): void {
    new PlanBuilderModal(
      this.app,
      this.plugin,
      this.routines,
      () => {
        void this.refresh();
      },
      existing
    ).open();
  }

  private async addRoutineToPlan(
    plan: WorkoutPlanDefinition,
    routine: RoutineDefinition
  ): Promise<void> {
    if (plan.routines.some((entry) => entry.routineId === routine.id)) return;
    plan.routines.push({
      routineId: routine.id,
      routineName: routine.name,
      routineLink: routine.filePath
        ? `[[${routine.filePath.replace(/\.md$/, "")}]]`
        : undefined,
    });
    try {
      await this.plugin.definitionService.createWorkoutPlanDefinition(plan);
      await this.setExpanded(plan.id, true);
    } catch (error) {
      console.error("Failed to add routine to plan", error);
      new Notice(`Could not add "${routine.name}" to ${plan.name}.`);
    }
  }
}
