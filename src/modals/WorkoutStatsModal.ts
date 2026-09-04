import { App, Modal } from "obsidian";
import { WorkoutFileService } from "../utils/workoutFileService";
import {
  WorkoutStatisticsService,
  WorkoutStatistics,
} from "../utils/workoutStatisticsService";
import WorkoutTrackerPlugin from "../plugin";
import {
  renderBarChart,
  renderHorizontalBarChart,
  renderLineChart,
  FREQUENCY_UNIT,
} from "../utils/chartRenderer";
import {
  createEmptyState,
  createHint,
  createIconButton,
  createList,
  createRow,
  createSection,
  createStatGrid,
  createStatTile,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

/** Months of history the charts look back over. */
const CHART_MONTHS = 12;

export class WorkoutStatsModal extends Modal {
  plugin: WorkoutTrackerPlugin;
  fileService: WorkoutFileService;
  statisticsService: WorkoutStatisticsService;
  private bodyEl: HTMLElement | null = null;

  constructor(app: App, plugin: WorkoutTrackerPlugin) {
    super(app);
    this.plugin = plugin;
    this.fileService = new WorkoutFileService(
      app,
      plugin.settings.defaultWorkoutFolder
    );
    this.statisticsService = new WorkoutStatisticsService();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("wj-modal-narrow");
    markPluginModal(contentEl, "wj-stats-modal");

    const headerActions = renderHeader(contentEl, {
      title: "Statistics",
      subtitle: "Everything logged so far, at a glance",
    });
    createIconButton(headerActions, "refresh-cw", "Refresh", () => {
      void this.load();
    });

    this.bodyEl = contentEl.createDiv({ cls: "wj-stats-body" });
    void this.load();
  }

  private async load(): Promise<void> {
    const body = this.bodyEl;
    if (!body) return;
    body.empty();
    createHint(body, "Loading statistics…");

    try {
      const workouts = await this.fileService.loadAllWorkouts();
      const stats = this.statisticsService.calculateStatistics(workouts);
      body.empty();
      this.renderStatistics(body, stats);
    } catch (error) {
      body.empty();
      createEmptyState(body, {
        title: "Could not read your workouts",
        body: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private renderStatistics(container: HTMLElement, stats: WorkoutStatistics) {
    if (stats.totalWorkouts === 0) {
      createEmptyState(container, {
        title: "Nothing logged yet",
        body: "Finish a workout and your numbers show up here.",
      });
      return;
    }

    const weightUnit = this.plugin.settings.weightUnit;

    // ── Overview tiles ──────────────────────────────────────────────────
    const overview = createSection(container, "Overview");
    const grid = createStatGrid(overview);
    createStatTile(grid, "Workouts", stats.totalWorkouts.toLocaleString());
    createStatTile(
      grid,
      "Streak",
      String(stats.workoutStreak),
      `day${stats.workoutStreak === 1 ? "" : "s"}`
    );
    createStatTile(grid, "Sets", stats.totalSets.toLocaleString());
    createStatTile(grid, "Exercises", stats.totalExercises.toLocaleString());
    createStatTile(
      grid,
      "Volume",
      stats.totalVolume.toLocaleString(),
      weightUnit
    );
    createStatTile(
      grid,
      "Avg. length",
      stats.averageWorkoutDuration.toFixed(0),
      "min"
    );
    createStatTile(grid, "Last workout", stats.lastWorkoutDate || "—");

    const allWorkouts = Object.values(stats.workoutsByDate).flat();

    // ── Monthly workouts ────────────────────────────────────────────────
    const monthlyCounts =
      this.statisticsService.getMonthlyWorkoutCounts(allWorkouts);
    const sortedMonths = Object.keys(monthlyCounts).sort().slice(-CHART_MONTHS);

    if (sortedMonths.length > 0) {
      const section = createSection(container, "Workouts per month");
      const chart = section.createDiv({ cls: "wt-chart-container" });
      renderBarChart(
        chart,
        sortedMonths.map((month) => this.formatMonth(month)),
        sortedMonths.map((month) => monthlyCounts[month]),
        { yLabel: "Workouts" }
      );
    }

    // ── Monthly volume ──────────────────────────────────────────────────
    const monthlyVolume: Record<string, number> = {};
    allWorkouts.forEach((workout) => {
      const month = workout.date.substring(0, 7);
      workout.exercises.forEach((exercise) => {
        exercise.sets.forEach((set) => {
          if (set.weight && set.reps) {
            monthlyVolume[month] =
              (monthlyVolume[month] || 0) + set.weight * set.reps;
          }
        });
      });
    });

    const volumeMonths = Object.keys(monthlyVolume).sort().slice(-CHART_MONTHS);
    if (volumeMonths.length >= 2) {
      const section = createSection(container, "Volume per month");
      const chart = section.createDiv({ cls: "wt-chart-container" });
      renderLineChart(
        chart,
        volumeMonths.map((month) => this.formatMonth(month)),
        volumeMonths.map((month) => monthlyVolume[month]),
        { yLabel: weightUnit, unit: weightUnit }
      );
    }

    // ── Exercise frequency ──────────────────────────────────────────────
    if (Object.keys(stats.exerciseFrequency).length > 0) {
      const section = createSection(container, "Most trained");
      const sortedExercises = Object.entries(stats.exerciseFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
      const chart = section.createDiv({ cls: "wt-chart-container" });
      renderHorizontalBarChart(
        chart,
        sortedExercises.map(([name]) => name),
        sortedExercises.map(([, count]) => count),
        { unit: FREQUENCY_UNIT }
      );
    }

    // ── Personal records ────────────────────────────────────────────────
    const records = Object.entries(stats.personalRecords);
    if (records.length > 0) {
      const section = createSection(container, "Personal records");
      const list = createList(section);
      records
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([exercise, record]) => {
          createRow(list, {
            title: exercise,
            meta: record.date,
            chips: [
              {
                text: `${record.weight} ${weightUnit} × ${record.reps}`,
                accent: true,
              },
            ],
          });
        });
    }

    // ── Recent activity ─────────────────────────────────────────────────
    const section = createSection(container, "Recent activity");
    const recentDates = Object.keys(stats.workoutsByDate).sort().slice(-7).reverse();

    if (recentDates.length === 0) {
      createHint(section, "No recent workouts.");
      return;
    }

    const list = createList(section);
    for (const date of recentDates) {
      for (const workout of stats.workoutsByDate[date]) {
        const setCount = workout.exercises.reduce(
          (total, exercise) => total + exercise.sets.length,
          0
        );
        const { actions } = createRow(list, {
          title: workout.name,
          meta: `${date} · ${workout.exercises.length} exercise${
            workout.exercises.length === 1 ? "" : "s"
          } · ${setCount} set${setCount === 1 ? "" : "s"}`,
          onClick: workout.filePath
            ? () => this.openNote(workout.filePath)
            : undefined,
        });
        if (workout.filePath) {
          createIconButton(actions, "file-text", "Open note", () =>
            this.openNote(workout.filePath)
          );
        }
      }
    }
  }

  private openNote(path: string | undefined): void {
    if (!path) return;
    this.close();
    void this.app.workspace.openLinkText(path, "", false);
  }

  /** "YYYY-MM" → "Mon 'YY", so the axis labels stay narrow. */
  private formatMonth(month: string): string {
    const [year, monthPart] = month.split("-");
    const date = new Date(Number(year), Number(monthPart) - 1, 1);
    return date.toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
