import { App, Modal, Setting } from "obsidian";
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

export class WorkoutStatsModal extends Modal {
  plugin: WorkoutTrackerPlugin;
  fileService: WorkoutFileService;
  statisticsService: WorkoutStatisticsService;

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
    void this._onOpen();
  }

  private async _onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Workout statistics" });

    // Show loading message
    const loadingEl = contentEl.createDiv({ text: "Loading statistics..." });

    try {
      const workouts = await this.fileService.loadAllWorkouts();
      const stats = this.statisticsService.calculateStatistics(workouts);
      loadingEl.remove();
      this.renderStatistics(contentEl, stats);
    } catch (error) {
      loadingEl.setText(`Error loading statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private renderStatistics(container: HTMLElement, stats: WorkoutStatistics) {
    // Overview Stats
    const overviewSection = container.createDiv();
    overviewSection.createEl("h3", { text: "Overview" });

    new Setting(overviewSection)
      .setName("Total workouts")
      .setDesc(stats.totalWorkouts.toString());

    new Setting(overviewSection)
      .setName("Total exercises")
      .setDesc(stats.totalExercises.toString());

    new Setting(overviewSection)
      .setName("Total sets")
      .setDesc(stats.totalSets.toString());

    new Setting(overviewSection)
      .setName("Total volume")
      .setDesc(
        `${stats.totalVolume.toLocaleString()} ${this.plugin.settings.weightUnit}`
      );

    new Setting(overviewSection)
      .setName("Average workout duration")
      .setDesc(`${stats.averageWorkoutDuration.toFixed(1)} minutes`);

    new Setting(overviewSection)
      .setName("Current streak")
      .setDesc(
        `${stats.workoutStreak} day${stats.workoutStreak !== 1 ? "s" : ""}`
      );

    new Setting(overviewSection)
      .setName("Last workout")
      .setDesc(stats.lastWorkoutDate || "No workouts yet");

    // Monthly Workouts Chart
    const monthlyCounts = this.statisticsService.getMonthlyWorkoutCounts(
      Object.values(stats.workoutsByDate).flat()
    );
    const sortedMonths = Object.keys(monthlyCounts).sort().slice(-12);

    if (sortedMonths.length > 0) {
      const monthlySection = container.createDiv({ cls: "wt-chart-section" });
      monthlySection.createEl("h3", { text: "Monthly workouts" });
      const chartContainer = monthlySection.createDiv({
        cls: "wt-chart-container",
      });
      renderBarChart(
        chartContainer,
        sortedMonths.map((m) => {
          // Format "YYYY-MM" → "Mon 'YY" for compact labels
          const [year, month] = m.split("-");
          const date = new Date(Number(year), Number(month) - 1, 1);
          return date.toLocaleDateString(undefined, {
            month: "short",
            year: "2-digit",
          });
        }),
        sortedMonths.map((m) => monthlyCounts[m]),
        { yLabel: "Workouts" }
      );
    }

    // Monthly Volume Line Chart
    const monthlyVolume: Record<string, number> = {};
    Object.values(stats.workoutsByDate)
      .flat()
      .forEach((workout) => {
        const month = workout.date.substring(0, 7);
        workout.exercises.forEach((ex) => {
          ex.sets.forEach((set) => {
            if (set.weight && set.reps) {
              monthlyVolume[month] =
                (monthlyVolume[month] || 0) + set.weight * set.reps;
            }
          });
        });
      });

    const volumeMonths = Object.keys(monthlyVolume).sort().slice(-12);
    if (volumeMonths.length >= 2) {
      const volumeSection = container.createDiv({ cls: "wt-chart-section" });
      volumeSection.createEl("h3", { text: "Monthly volume" });
      const chartContainer = volumeSection.createDiv({
        cls: "wt-chart-container",
      });
      renderLineChart(
        chartContainer,
        volumeMonths.map((m) => {
          const [year, month] = m.split("-");
          const date = new Date(Number(year), Number(month) - 1, 1);
          return date.toLocaleDateString(undefined, {
            month: "short",
            year: "2-digit",
          });
        }),
        volumeMonths.map((m) => monthlyVolume[m]),
        {
          yLabel: this.plugin.settings.weightUnit,
          unit: this.plugin.settings.weightUnit,
        }
      );
    }

    // Exercise Frequency Chart
    if (Object.keys(stats.exerciseFrequency).length > 0) {
      const frequencySection = container.createDiv({ cls: "wt-chart-section" });
      frequencySection.createEl("h3", { text: "Exercise frequency" });

      const sortedExercises = Object.entries(stats.exerciseFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      const chartContainer = frequencySection.createDiv({
        cls: "wt-chart-container",
      });
      renderHorizontalBarChart(
        chartContainer,
        sortedExercises.map(([name]) => name),
        sortedExercises.map(([, count]) => count),
        { unit: FREQUENCY_UNIT }
      );
    }

    // Personal Records
    if (Object.keys(stats.personalRecords).length > 0) {
      const prSection = container.createDiv();
      prSection.createEl("h3", { text: "Personal records" });

      Object.entries(stats.personalRecords).forEach(([exercise, record]) => {
        new Setting(prSection)
          .setName(exercise)
          .setDesc(
            `${record.weight} ${this.plugin.settings.weightUnit} × ${record.reps} reps (${record.date})`
          );
      });
    }

    // Recent Activity
    const recentSection = container.createDiv();
    recentSection.createEl("h3", { text: "Recent activity" });

    const recentDates = Object.keys(stats.workoutsByDate).sort().slice(-7); // Last 7 days with workouts

    if (recentDates.length > 0) {
      recentDates.forEach((date) => {
        const workouts = stats.workoutsByDate[date];
        new Setting(recentSection)
          .setName(date)
          .setDesc(
            `${workouts.length} workout${
              workouts.length !== 1 ? "s" : ""
            }: ${workouts.map((w) => w.name).join(", ")}`
          );
      });
    } else {
      recentSection.createEl("p", { text: "No recent workouts found." });
    }

    // Refresh button
    new Setting(container).addButton((btn) =>
      btn.setButtonText("Refresh statistics").onClick(async () => {
        container.empty();
        container.createEl("h2", { text: "Workout statistics" });
        const loadingEl = container.createDiv({
          text: "Loading statistics...",
        });

        try {
          const workouts = await this.fileService.loadAllWorkouts();
          const newStats = this.statisticsService.calculateStatistics(workouts);
          loadingEl.remove();
          this.renderStatistics(container, newStats);
        } catch (error) {
          loadingEl.setText(`Error loading statistics: ${error instanceof Error ? error.message : String(error)}`);
        }
      })
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
