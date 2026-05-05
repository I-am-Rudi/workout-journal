import { App, PluginSettingTab, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { ExerciseSettingsPage } from "./ExerciseSettingsPage";
import { RoutineSettingsPage } from "./RoutineSettingsPage";
import { PlanSettingsPage } from "./PlanSettingsPage";
import { NoteContentTemplatesPage } from "./NoteContentTemplatesPage";
import { StrongImportModal } from "../modals/StrongImportModal";

type SettingsPage = "main" | "exercises" | "routines" | "plans" | "templates";

export class WorkoutTrackerSettingTab extends PluginSettingTab {
  plugin: WorkoutTrackerPlugin;
  private currentPage: SettingsPage = "main";

  constructor(app: App, plugin: WorkoutTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    switch (this.currentPage) {
      case "exercises":
        this.renderExercises();
        break;
      case "routines":
        this.renderRoutines();
        break;
      case "plans":
        this.renderPlans();
        break;
      case "templates":
        this.renderTemplates();
        break;
      default:
        this.renderMain();
    }
  }

  private renderMain(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Workout Journal Settings" });

    new Setting(containerEl)
      .setName("Default Workout Folder")
      .setDesc("Folder where workout files will be created")
      .addText((text) =>
        text
          .setPlaceholder("Workouts")
          .setValue(this.plugin.settings.defaultWorkoutFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultWorkoutFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Exercise Library Folder")
      .setDesc("Folder containing exercise definition notes")
      .addText((text) =>
        text
          .setPlaceholder("Workout Library/Exercises")
          .setValue(this.plugin.settings.exerciseLibraryFolder)
          .onChange(async (value) => {
            this.plugin.settings.exerciseLibraryFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Routines Folder")
      .setDesc("Folder containing routine definition notes")
      .addText((text) =>
        text
          .setPlaceholder("Workout Library/Routines")
          .setValue(this.plugin.settings.routinesFolder)
          .onChange(async (value) => {
            this.plugin.settings.routinesFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Workout Plans Folder")
      .setDesc("Folder containing workout plan definition notes")
      .addText((text) =>
        text
          .setPlaceholder("Workout Library/Plans")
          .setValue(this.plugin.settings.workoutPlansFolder)
          .onChange(async (value) => {
            this.plugin.settings.workoutPlansFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Performance CSV Path")
      .setDesc("CSV file used for previous values and target progression")
      .addText((text) =>
        text
          .setPlaceholder("Workouts/workout-performance.csv")
          .setValue(this.plugin.settings.performanceCsvPath)
          .onChange(async (value) => {
            this.plugin.settings.performanceCsvPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable Exercise Autocomplete")
      .setDesc("Show exercise suggestions when typing")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoComplete)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoComplete = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-sync Frontmatter")
      .setDesc(
        "Automatically sync frontmatter when workout files are manually edited"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoSyncFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoSyncFrontmatter = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-sync Delay")
      .setDesc(
        "Wait time (in milliseconds) after stopping typing before syncing frontmatter"
      )
      .addText((text) =>
        text
          .setPlaceholder("2000")
          .setValue(this.plugin.settings.autoSyncDelayMs.toString())
          .onChange(async (value) => {
            const delay = parseInt(value);
            if (!isNaN(delay) && delay >= 500) {
              // Minimum 500ms
              this.plugin.settings.autoSyncDelayMs = delay;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Date Format")
      .setDesc("Format for workout dates")
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD")
          .setValue(this.plugin.settings.dateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dateFormat = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Weight Unit")
      .setDesc("Global weight unit used across logging and stats")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("lb", "lb")
          .addOption("kg", "kg")
          .setValue(this.plugin.settings.weightUnit)
          .onChange(async (value) => {
            this.plugin.settings.weightUnit = value as "kg" | "lb";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default Rest Timer")
      .setDesc(
        "Rest timer duration in seconds started automatically when a set is checked off (0 to disable)"
      )
      .addText((text) =>
        text
          .setPlaceholder("90")
          .setValue(String(this.plugin.settings.defaultRestTimerSeconds))
          .onChange(async (value) => {
            const seconds = parseInt(value);
            if (!isNaN(seconds) && seconds >= 0) {
              this.plugin.settings.defaultRestTimerSeconds = seconds;
              await this.plugin.saveSettings();
            }
          })
      );

    containerEl.createEl("h3", { text: "Migration" });
    new Setting(containerEl)
      .setName("Template Migration Status")
      .setDesc(
        this.plugin.settings.migration.completed
          ? `Completed at ${this.plugin.settings.migration.migratedAt}. Exercises: ${this.plugin.settings.migration.exerciseCount}, Routines: ${this.plugin.settings.migration.routineCount}.`
          : "Not yet migrated."
      )
      .addButton((btn) =>
        btn.setButtonText("Migrate Templates to Notes").onClick(async () => {
          await this.plugin.migrateTemplatesToNotes();
          this.display();
        })
      );

    containerEl.createEl("h3", { text: "Import" });
    new Setting(containerEl)
      .setName("Import from Strong App")
      .setDesc("Import workout history exported from the Strong app (workouts.csv).")
      .addButton((btn) =>
        btn
          .setButtonText("Import from Strong App")
          .onClick(() => new StrongImportModal(this.app, this.plugin).open())
      );

    containerEl.createEl("h3", { text: "Library" });

    const exerciseCount = this.plugin.settings.exerciseTemplates.length;
    new Setting(containerEl)
      .setName("Exercise Templates")
      .setDesc(
        `${exerciseCount} template${exerciseCount !== 1 ? "s" : ""} defined (legacy settings-based)`
      )
      .addButton((btn) =>
        btn.setButtonText("Manage →").onClick(() => {
          this.currentPage = "exercises";
          this.display();
        })
      );

    const routineCount = this.plugin.settings.workoutTemplates.length;
    new Setting(containerEl)
      .setName("Routine Templates")
      .setDesc(
        `${routineCount} template${routineCount !== 1 ? "s" : ""} defined (legacy settings-based)`
      )
      .addButton((btn) =>
        btn.setButtonText("Manage →").onClick(() => {
          this.currentPage = "routines";
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Workout Plans")
      .setDesc("Create and manage note-based workout plans built from routines")
      .addButton((btn) =>
        btn.setButtonText("Manage →").onClick(() => {
          this.currentPage = "plans";
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Note Content Templates")
      .setDesc("Extra frontmatter and body text appended to each generated note type")
      .addButton((btn) =>
        btn.setButtonText("Manage →").onClick(() => {
          this.currentPage = "templates";
          this.display();
        })
      );
  }

  private renderExercises(): void {
    const { containerEl } = this;
    new ExerciseSettingsPage().render(containerEl, this.app, this.plugin, () => {
      this.currentPage = "main";
      this.display();
    });
  }

  private renderRoutines(): void {
    const { containerEl } = this;
    new RoutineSettingsPage().render(containerEl, this.app, this.plugin, () => {
      this.currentPage = "main";
      this.display();
    });
  }

  private renderPlans(): void {
    const { containerEl } = this;
    new PlanSettingsPage().render(containerEl, this.app, this.plugin, () => {
      this.currentPage = "main";
      this.display();
    });
  }

  private renderTemplates(): void {
    const { containerEl } = this;
    new NoteContentTemplatesPage().render(containerEl, this.plugin, () => {
      this.currentPage = "main";
      this.display();
    });
  }
}
