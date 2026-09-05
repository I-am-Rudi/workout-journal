import { App, Modal, Notice, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import {
  StrongImportService,
  StrongImportOptions,
  parseStrongWorkoutsCsv,
  deriveExerciseDefsFromWorkouts,
} from "../utils/strongImportService";
import { Workout } from "../types";
import {
  createActionBar,
  createNote,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export class StrongImportModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private importService: StrongImportService;

  private parsedWorkouts: Workout[] = [];

  private options: StrongImportOptions = {
    createWorkoutNotes: true,
    addToPerformanceCsv: true,
    importExerciseDefinitions: false,
    enrichFromCatalog: true,
    skipDuplicates: true,
  };

  // UI elements that are updated dynamically
  private previewEl!: HTMLElement;
  private importBtnEl!: HTMLButtonElement;
  private workoutsFileLabel!: HTMLElement;
  private errorEl!: HTMLElement;

  constructor(app: App, plugin: WorkoutTrackerPlugin) {
    super(app);
    this.plugin = plugin;
    this.importService = new StrongImportService(
      app,
      plugin.performanceCsvService,
      plugin.fileService,
      plugin.definitionService,
      plugin.catalogMatcher,
      plugin.catalogImportService
    );
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl, "strong-import-modal");

    renderHeader(contentEl, {
      title: "Import from Strong",
      subtitle: "Bring your workout history over from the Strong app",
    });

    // ── Workouts CSV ──────────────────────────────────────────────────────
    new Setting(contentEl).setName("Workouts").setHeading();

    const workoutsInput = contentEl.createEl("input");
    workoutsInput.type = "file";
    workoutsInput.accept = ".csv";
    workoutsInput.hide();

    this.workoutsFileLabel = createNote(contentEl, "No file selected", "inset");

    new Setting(contentEl)
      .setName("Workouts csv")
      .setDesc('Export your workouts from Strong: profile → settings → export data → "workouts csv"')
      .addButton((btn) =>
        btn.setButtonText("Choose file…").onClick(() => workoutsInput.click())
      );

    workoutsInput.addEventListener("change", () => {
      void (async () => {
        const file = workoutsInput.files?.[0];
        if (!file) return;
        this.workoutsFileLabel.setText(`Selected: ${file.name}`);
        this.clearError();
        try {
          const content = await readFileAsText(file);
          this.parsedWorkouts = parseStrongWorkoutsCsv(content);
          this.updatePreview();
          this.importBtnEl.disabled = false;
        } catch (err) {
          this.showError(`Failed to parse workouts.csv: ${(err as Error).message}`);
        }
      })();
    });

    // ── Options ───────────────────────────────────────────────────────────
    new Setting(contentEl).setName("Options").setHeading();

    // Weight unit warning
    const configuredUnit = this.plugin.settings.weightUnit;
    createNote(
      contentEl,
      `Strong exports weights in the unit you used in the app. This plugin is configured to use "${configuredUnit}". Weights are imported as-is — verify your Strong unit matches.`,
      "accent"
    );

    new Setting(contentEl)
      .setName("Create workout notes")
      .setDesc("Write one Markdown note per workout into your workout folder.")
      .addToggle((toggle) =>
        toggle.setValue(this.options.createWorkoutNotes).onChange((v) => {
          this.options.createWorkoutNotes = v;
        })
      );

    new Setting(contentEl)
      .setName("Skip duplicate workouts")
      .setDesc(
        "Skip workouts whose note file already exists (same date + name)."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.options.skipDuplicates).onChange((v) => {
          this.options.skipDuplicates = v;
        })
      );

    new Setting(contentEl)
      .setName("Add to performance CSV")
      .setDesc("Append imported sets to the performance tracking CSV.")
      .addToggle((toggle) =>
        toggle.setValue(this.options.addToPerformanceCsv).onChange((v) => {
          this.options.addToPerformanceCsv = v;
        })
      );

    new Setting(contentEl)
      .setName("Import exercise definitions")
      .setDesc(
        "Create an exercise note for each unique exercise name found in workouts.csv. Notes are created with type 'other'; you can edit each note afterwards."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.options.importExerciseDefinitions)
          .onChange((v) => {
            this.options.importExerciseDefinitions = v;
          })
      );

    new Setting(contentEl)
      .setName("Fill in descriptions from the exercise catalog")
      .setDesc(
        "Recognises exercises by name and adds the catalog description, muscles and equipment. Your exercise names are kept exactly as Strong wrote them."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.options.enrichFromCatalog).onChange((v) => {
          this.options.enrichFromCatalog = v;
          this.updatePreview();
        })
      );

    // ── Preview ───────────────────────────────────────────────────────────
    new Setting(contentEl).setName("Preview").setHeading();
    this.previewEl = createNote(
      contentEl,
      "Load a workouts.csv file to see a preview.",
      "inset"
    );

    // ── Error area ────────────────────────────────────────────────────────
    this.errorEl = createNote(contentEl, "", "warning");
    this.errorEl.hide();

    // ── Import button ─────────────────────────────────────────────────────
    const actions = createActionBar(contentEl);
    this.importBtnEl = actions.createEl("button", {
      text: "Import",
      cls: "wj-btn wj-btn-primary",
    });
    this.importBtnEl.disabled = true;
    this.importBtnEl.addEventListener("click", () => {
      void this.runImport();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  private updatePreview() {
    const summary = this.importService.summarize(this.parsedWorkouts);
    const dr = summary.dateRange;
    const dateRange = dr ? `${dr.earliest} → ${dr.latest}` : "—";

    let line =
      `${this.parsedWorkouts.length} workouts found` +
      ` | ${summary.uniqueExerciseCount} unique exercises` +
      ` | Date range: ${dateRange}`;

    // Showing the match count up front keeps the miss rate honest: Strong names
    // like "Bench Press (Barbell)" only line up with the catalog some of the
    // time, and the rest are attached one at a time afterwards.
    if (this.options.enrichFromCatalog && this.parsedWorkouts.length) {
      const names = new Set<string>();
      for (const workout of this.parsedWorkouts) {
        for (const exercise of workout.exercises) names.add(exercise.name);
      }
      let matched = 0;
      for (const name of names) {
        if (this.plugin.catalogMatcher.findExact(name)) matched++;
      }
      line += ` | ${matched} of ${names.size} recognised in the catalog`;
    }

    this.previewEl.setText(line);
  }

  private showError(msg: string) {
    this.errorEl.setText(msg);
    this.errorEl.show();
  }

  private clearError() {
    this.errorEl.hide();
    this.errorEl.setText("");
  }

  private async runImport() {
    this.importBtnEl.disabled = true;
    this.importBtnEl.setText("Importing…");
    this.clearError();

    try {
      const exerciseDefs = this.options.importExerciseDefinitions
        ? deriveExerciseDefsFromWorkouts(this.parsedWorkouts)
        : [];
      const result = await this.importService.importAll(
        this.parsedWorkouts,
        exerciseDefs,
        this.options
      );

      const parts: string[] = [];
      if (this.options.createWorkoutNotes) {
        parts.push(`${result.workoutsCreated} workouts created`);
        if (result.workoutsSkipped > 0)
          parts.push(`${result.workoutsSkipped} skipped`);
      }
      if (this.options.importExerciseDefinitions && result.exercisesImported > 0) {
        parts.push(`${result.exercisesImported} exercises imported`);
        if (result.exercisesMatched > 0)
          parts.push(`${result.exercisesMatched} matched to the catalog`);
      }

      new Notice(`Strong import complete: ${parts.join(", ")}.`);

      if (result.errors.length > 0) {
        this.showError(
          `Import completed with ${result.errors.length} error(s):\n` +
            result.errors.join("\n")
        );
        this.importBtnEl.setText("Import");
        this.importBtnEl.disabled = false;
      } else {
        this.close();
      }
    } catch (err) {
      this.showError(`Import failed: ${(err as Error).message}`);
      this.importBtnEl.setText("Import");
      this.importBtnEl.disabled = false;
    }
  }
}
