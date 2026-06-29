import { App, Modal, Notice, Setting } from "obsidian";
import { ExerciseDefinition } from "../types";
import WorkoutTrackerPlugin from "../plugin";
import { createIdFromName } from "../utils/idUtils";

export class ExerciseDefinitionModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private existing: ExerciseDefinition | undefined;
  private onSave: () => void;

  private name = "";
  private type: ExerciseDefinition["type"] = "strength";
  private muscleGroups: string[] = [];
  private defaultSets: number | undefined;
  private defaultReps: number | undefined;
  private defaultWeight: number | undefined;
  private defaultDuration: number | undefined;
  private defaultDistance: number | undefined;
  private notes = "";

  constructor(app: App, plugin: WorkoutTrackerPlugin, onSave: () => void, existing?: ExerciseDefinition) {
    super(app);
    this.plugin = plugin;
    this.existing = existing;
    this.onSave = onSave;
    if (existing) {
      this.name = existing.name;
      this.type = existing.type;
      this.muscleGroups = [...existing.muscleGroups];
      this.defaultSets = existing.defaultSets;
      this.defaultReps = existing.defaultReps;
      this.defaultWeight = existing.defaultWeight;
      this.defaultDuration = existing.defaultDuration;
      this.defaultDistance = existing.defaultDistance;
      this.notes = existing.notes ?? "";
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.existing ? "Edit exercise" : "New exercise" });

    new Setting(contentEl).setName("Name").addText((t) =>
      t.setValue(this.name).onChange((v) => { this.name = v.trim(); })
    );

    new Setting(contentEl).setName("Type").addDropdown((d) =>
      d.addOption("strength", "Strength")
        .addOption("cardio", "Cardio")
        .addOption("flexibility", "Flexibility")
        .addOption("other", "Other")
        .setValue(this.type)
        .onChange((v) => { this.type = v as ExerciseDefinition["type"]; })
    );

    new Setting(contentEl)
      .setName("Muscle groups")
      .setDesc("Comma-separated, e.g. chest, triceps")
      .addText((t) =>
        t.setValue(this.muscleGroups.join(", ")).onChange((v) => {
          this.muscleGroups = v.split(",").map((s) => s.trim()).filter(Boolean);
        })
      );

    new Setting(contentEl).setName("Default sets").addText((t) =>
      t.setPlaceholder("3").setValue(this.defaultSets !== undefined ? String(this.defaultSets) : "")
        .onChange((v) => { this.defaultSets = v ? parseInt(v) : undefined; })
    );

    new Setting(contentEl).setName("Default reps").addText((t) =>
      t.setPlaceholder("8").setValue(this.defaultReps !== undefined ? String(this.defaultReps) : "")
        .onChange((v) => { this.defaultReps = v ? parseInt(v) : undefined; })
    );

    new Setting(contentEl).setName("Default weight").addText((t) =>
      t.setPlaceholder("0").setValue(this.defaultWeight !== undefined ? String(this.defaultWeight) : "")
        .onChange((v) => { this.defaultWeight = v ? parseFloat(v) : undefined; })
    );

    new Setting(contentEl).setName("Default duration (min)").addText((t) =>
      t.setPlaceholder("–").setValue(this.defaultDuration !== undefined ? String(this.defaultDuration) : "")
        .onChange((v) => { this.defaultDuration = v ? parseFloat(v) : undefined; })
    );

    new Setting(contentEl).setName("Default distance (km)").addText((t) =>
      t.setPlaceholder("–").setValue(this.defaultDistance !== undefined ? String(this.defaultDistance) : "")
        .onChange((v) => { this.defaultDistance = v ? parseFloat(v) : undefined; })
    );

    new Setting(contentEl).setName("Notes").addTextArea((t) =>
      t.setValue(this.notes).onChange((v) => { this.notes = v; })
    );

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("Save").setCta().onClick(() => { void this.save(); })
    ).addButton((btn) =>
      btn.setButtonText("Cancel").onClick(() => this.close())
    );
  }

  private async save(): Promise<void> {
    if (!this.name) {
      new Notice("Exercise name is required.");
      return;
    }
    const def: ExerciseDefinition = {
      id: this.existing?.id ?? createIdFromName(this.name),
      name: this.name,
      type: this.type,
      muscleGroups: this.muscleGroups,
      defaultSets: this.defaultSets,
      defaultReps: this.defaultReps,
      defaultWeight: this.defaultWeight,
      defaultDuration: this.defaultDuration,
      defaultDistance: this.defaultDistance,
      notes: this.notes || undefined,
      filePath: this.existing?.filePath,
      lastPerformedReps: this.existing?.lastPerformedReps,
      lastPerformedWeight: this.existing?.lastPerformedWeight,
    };
    await this.plugin.definitionService.createExerciseDefinition(def);
    new Notice(`Exercise saved: ${def.name}`);
    this.onSave();
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
