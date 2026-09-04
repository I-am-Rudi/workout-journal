import { App, Modal, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { Workout } from "../types";
import {
  createEmptyState,
  createHint,
  createList,
  createRow,
  createSectionLabel,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

/**
 * Every logged workout, newest first, grouped by month.
 *
 * The rows are links: tapping one leaves the dashboard and opens the workout
 * note, which is where the full set tables live.
 */
export class WorkoutHistoryModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private workouts: Workout[] = [];
  private searchQuery = "";
  private listEl: HTMLElement | null = null;
  /** Lets the surface that opened this one close itself when a note is opened. */
  private onNavigate?: () => void;

  constructor(app: App, plugin: WorkoutTrackerPlugin, onNavigate?: () => void) {
    super(app);
    this.plugin = plugin;
    this.onNavigate = onNavigate;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("wj-modal-narrow");
    markPluginModal(contentEl, "wj-history-modal");

    renderHeader(contentEl, {
      title: "Workout history",
      subtitle: "Every workout you have logged — tap one to open its note",
    });

    new Setting(contentEl).setName("Search").addText((text) => {
      text.setPlaceholder("Workout or exercise name…").onChange((value) => {
        this.searchQuery = value;
        this.renderList();
      });
    });

    this.listEl = contentEl.createDiv({ cls: "wj-picker-list" });
    createHint(this.listEl, "Loading workouts…");

    void this.load();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async load(): Promise<void> {
    const workouts = await this.plugin.fileService.loadAllWorkouts();
    // Newest first; the date is the sort key, the name only breaks ties.
    this.workouts = workouts.sort(
      (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)
    );
    this.renderList();
  }

  private renderList(): void {
    const container = this.listEl;
    if (!container) return;
    container.empty();

    if (!this.workouts.length) {
      createEmptyState(container, {
        title: "No workouts logged yet",
        body: "Finish a session and it shows up here.",
      });
      return;
    }

    const query = this.searchQuery.trim().toLowerCase();
    const matches = this.workouts.filter((workout) => {
      if (!query) return true;
      return (
        workout.name.toLowerCase().includes(query) ||
        workout.date.includes(query) ||
        workout.exercises.some((exercise) =>
          exercise.name.toLowerCase().includes(query)
        )
      );
    });

    if (!matches.length) {
      createHint(container, "No workouts match that search.");
      return;
    }

    let currentMonth = "";
    let list = createList(container);

    for (const workout of matches) {
      const month = workout.date.substring(0, 7);
      if (month !== currentMonth) {
        currentMonth = month;
        const label = createSectionLabel(container, this.formatMonth(month));
        label.addClass("wj-picker-group-label");
        list = createList(container);
      }

      const setCount = workout.exercises.reduce(
        (total, exercise) => total + exercise.sets.length,
        0
      );
      const meta = [
        `${workout.exercises.length} exercise${workout.exercises.length === 1 ? "" : "s"}`,
        `${setCount} set${setCount === 1 ? "" : "s"}`,
        workout.duration ? `${workout.duration} min` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      createRow(list, {
        title: workout.name,
        meta,
        chips: [{ text: this.formatDay(workout.date) }],
        muted: !workout.filePath,
        onClick: workout.filePath
          ? () => {
              this.close();
              this.onNavigate?.();
              void this.app.workspace.openLinkText(workout.filePath!, "", false);
            }
          : undefined,
      });
    }
  }

  /** "YYYY-MM" → "September 2026". */
  private formatMonth(month: string): string {
    const [year, monthPart] = month.split("-");
    const date = new Date(Number(year), Number(monthPart) - 1, 1);
    if (Number.isNaN(date.getTime())) return month;
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  /** "YYYY-MM-DD" → "Fri 4", enough to place it within its month heading. */
  private formatDay(isoDate: string): string {
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
    });
  }
}
