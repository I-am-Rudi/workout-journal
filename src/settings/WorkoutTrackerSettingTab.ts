import { App, normalizePath, PluginSettingTab, Setting } from "obsidian";
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

    containerEl.createEl("p", {
      text: "Configure folders, tracking behavior, and library tools for Workout Journal.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Default workout folder")
      .setDesc("Folder where workout files will be created")
      .addText((text) =>
        text
          .setPlaceholder("Workouts")
          .setValue(this.plugin.settings.defaultWorkoutFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultWorkoutFolder = value.trim()
              ? normalizePath(value.trim())
              : "";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Exercise library folder")
      .setDesc("Folder containing exercise definition notes")
      .addText((text) =>
        text
          .setPlaceholder("Workout library/exercises")
          .setValue(this.plugin.settings.exerciseLibraryFolder)
          .onChange(async (value) => {
            this.plugin.settings.exerciseLibraryFolder = value.trim()
              ? normalizePath(value.trim())
              : "";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Routines folder")
      .setDesc("Folder containing routine definition notes")
      .addText((text) =>
        text
          .setPlaceholder("Workout library/routines")
          .setValue(this.plugin.settings.routinesFolder)
          .onChange(async (value) => {
            this.plugin.settings.routinesFolder = value.trim()
              ? normalizePath(value.trim())
              : "";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Workout plans folder")
      .setDesc("Folder containing workout plan definition notes")
      .addText((text) =>
        text
          .setPlaceholder("Workout library/plans")
          .setValue(this.plugin.settings.workoutPlansFolder)
          .onChange(async (value) => {
            this.plugin.settings.workoutPlansFolder = value.trim()
              ? normalizePath(value.trim())
              : "";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Performance CSV path")
      .setDesc("CSV file used for previous values and target progression")
      .addText((text) =>
        text
          .setPlaceholder("Workouts/workout-performance.csv")
          .setValue(this.plugin.settings.performanceCsvPath)
          .onChange(async (value) => {
            this.plugin.settings.performanceCsvPath = value.trim()
              ? normalizePath(value.trim())
              : "";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable exercise autocomplete")
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
      .setName("Auto-sync frontmatter")
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
      .setName("Auto-sync delay")
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
      .setName("Date format")
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
      .setName("Weight unit")
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
      .setName("Default rest timer")
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

    new Setting(containerEl)
      .setName("Set completion vibration feedback")
      .setDesc("Vibrate when checking off a set (mobile only)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableSetCompletionVibrationFeedback)
          .onChange(async (value) => {
            this.plugin.settings.enableSetCompletionVibrationFeedback = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Set completion sound feedback")
      .setDesc("Play a sound when checking off a set")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableSetCompletionSoundFeedback)
          .onChange(async (value) => {
            this.plugin.settings.enableSetCompletionSoundFeedback = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Rest timer vibration feedback")
      .setDesc("Vibrate when a rest timer completes (mobile only)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableRestTimerVibrationFeedback)
          .onChange(async (value) => {
            this.plugin.settings.enableRestTimerVibrationFeedback = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Rest timer sound feedback")
      .setDesc("Play a sound when a rest timer completes")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableRestTimerSoundFeedback)
          .onChange(async (value) => {
            this.plugin.settings.enableRestTimerSoundFeedback = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Examples").setHeading();
    new Setting(containerEl)
      .setName("Add example templates")
      .setDesc("Create a small set of sample exercise and routine notes to explore the plugin.")
      .addButton((btn) =>
        btn.setButtonText("Add examples").onClick(async () => {
          await this.plugin.addExampleTemplates();
          this.display();
        })
      );

    new Setting(containerEl).setName("Import").setHeading();
    new Setting(containerEl)
      .setName("Import from strong app")
      .setDesc("Import workout history exported from the strong app (workouts.csv).")
      .addButton((btn) =>
        btn
          .setButtonText("Import from strong app")
          .onClick(() => new StrongImportModal(this.app, this.plugin).open())
      );

    new Setting(containerEl).setName("Library").setHeading();

    new Setting(containerEl)
      .setName("Exercises")
      .setDesc("Manage exercise definitions stored as notes in your vault")
      .addButton((btn) =>
        btn.setButtonText("Manage →").onClick(() => {
          this.currentPage = "exercises";
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Routines")
      .setDesc("Manage workout routines stored as notes in your vault")
      .addButton((btn) =>
        btn.setButtonText("Manage →").onClick(() => {
          this.currentPage = "routines";
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Workout plans")
      .setDesc("Create and manage note-based workout plans built from routines")
      .addButton((btn) =>
        btn.setButtonText("Manage →").onClick(() => {
          this.currentPage = "plans";
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Note content templates")
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
    void new ExerciseSettingsPage().render(containerEl, this.app, this.plugin, () => {
      this.currentPage = "main";
      this.display();
    });
  }

  private renderRoutines(): void {
    const { containerEl } = this;
    void new RoutineSettingsPage().render(containerEl, this.app, this.plugin, () => {
      this.currentPage = "main";
      this.display();
    });
  }

  private renderPlans(): void {
    const { containerEl } = this;
    void new PlanSettingsPage().render(containerEl, this.app, this.plugin, () => {
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
