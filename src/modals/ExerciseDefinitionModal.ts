import { App, Modal, Notice, Setting } from "obsidian";
import { ExerciseDefinition, ExerciseType } from "../types";
import WorkoutTrackerPlugin from "../plugin";
import { createIdFromName } from "../utils/idUtils";
import {
  EXERCISE_TYPES,
  EXERCISE_TYPE_LABELS,
  isDurationOnly,
  isRepsOnly,
} from "../utils/exerciseTypeUtils";
import { CatalogExercise } from "../utils/catalogService";
import { CatalogPickerModal } from "./CatalogPickerModal";
import { toTitleCase } from "../utils/titleCase";
import {
  createActionBar,
  createButton,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

export class ExerciseDefinitionModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private existing: ExerciseDefinition | undefined;
  private onSave: () => void;

  private name = "";
  private type: ExerciseType = "strength";
  private muscleGroups: string[] = [];
  private defaultSets: number | undefined;
  private defaultReps: number | undefined;
  private defaultWeight: number | undefined;
  private defaultDuration: number | undefined;
  private defaultDistance: number | undefined;
  private notes = "";

  /**
   * Catalog-owned fields. They are not editable here, but they must survive a
   * save: applyExerciseFrontmatter deletes every key whose value is undefined,
   * so dropping them would strip the note's catalog link on the next edit.
   */
  private equipment: string | undefined;
  private description: string | undefined;
  private source: string | undefined;
  private sourceId: string | undefined;
  private catalogName: string | undefined;
  private mediaId: string | undefined;
  private mediaMode: ExerciseDefinition["mediaMode"];
  /** Set when the user picks a record this session; applied on save. */
  private pickedRecord: CatalogExercise | undefined;

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    onSave: () => void,
    existing?: ExerciseDefinition,
    /** Prefills the name when creating, so "create X" flows land ready to save. */
    initialName?: string
  ) {
    super(app);
    this.plugin = plugin;
    this.existing = existing;
    this.onSave = onSave;
    if (!existing && initialName) this.name = initialName;
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
      this.equipment = existing.equipment;
      this.description = existing.description;
      this.source = existing.source;
      this.sourceId = existing.sourceId;
      this.catalogName = existing.catalogName;
      this.mediaId = existing.mediaId;
      this.mediaMode = existing.mediaMode;
    }
  }

  onOpen() {
    this.render();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl);
    renderHeader(contentEl, {
      title: this.existing ? "Edit exercise" : "New exercise",
      subtitle: this.existing
        ? "Changes are written back to the exercise note"
        : "Saved as a note in your exercise library",
    });

    new Setting(contentEl).setName("Name").addText((t) =>
      t.setValue(this.name).onChange((v) => { this.name = v.trim(); })
    );

    this.renderCatalogRow(contentEl);

    new Setting(contentEl).setName("Type").addDropdown((d) => {
      for (const type of EXERCISE_TYPES) {
        d.addOption(type, EXERCISE_TYPE_LABELS[type]);
      }
      d.setValue(this.type).onChange((v) => {
        this.type = v as ExerciseType;
        // The relevant default fields differ per type, so redraw the form.
        this.render();
      });
    });

    new Setting(contentEl)
      .setName("Muscle groups")
      .setDesc("Comma-separated, e.g. chest, triceps")
      .addText((t) =>
        t.setValue(this.muscleGroups.join(", ")).onChange((v) => {
          this.muscleGroups = v.split(",").map((s) => s.trim()).filter(Boolean);
        })
      );

    const repsOnly = isRepsOnly(this.type);
    const durationOnly = isDurationOnly(this.type);

    new Setting(contentEl).setName("Default sets").addText((t) =>
      t.setPlaceholder("3").setValue(this.defaultSets !== undefined ? String(this.defaultSets) : "")
        .onChange((v) => { this.defaultSets = v ? parseInt(v) : undefined; })
    );

    if (!durationOnly) {
      new Setting(contentEl).setName("Default reps").addText((t) =>
        t.setPlaceholder("8").setValue(this.defaultReps !== undefined ? String(this.defaultReps) : "")
          .onChange((v) => { this.defaultReps = v ? parseInt(v) : undefined; })
      );
    }

    if (!durationOnly && !repsOnly) {
      new Setting(contentEl).setName(`Default weight (${this.plugin.settings.weightUnit})`).addText((t) =>
        t.setPlaceholder("0").setValue(this.defaultWeight !== undefined ? String(this.defaultWeight) : "")
          .onChange((v) => { this.defaultWeight = v ? parseFloat(v) : undefined; })
      );
    }

    if (!repsOnly) {
      const durationSetting = new Setting(contentEl).setName(
        durationOnly ? "Default duration (s)" : "Default duration (min)"
      );
      if (durationOnly) {
        durationSetting.setDesc("Time window used when this exercise runs in a circuit.");
      }
      durationSetting.addText((t) =>
        t.setPlaceholder(durationOnly ? "30" : "–")
          .setValue(this.defaultDuration !== undefined ? String(this.defaultDuration) : "")
          .onChange((v) => { this.defaultDuration = v ? parseFloat(v) : undefined; })
      );
    }

    if (!durationOnly && !repsOnly) {
      new Setting(contentEl).setName(`Default distance (${this.plugin.settings.distanceUnit})`).addText((t) =>
        t.setPlaceholder("–").setValue(this.defaultDistance !== undefined ? String(this.defaultDistance) : "")
          .onChange((v) => { this.defaultDistance = v ? parseFloat(v) : undefined; })
      );
    }

    new Setting(contentEl).setName("Notes").addTextArea((t) =>
      t.setValue(this.notes).onChange((v) => { this.notes = v; })
    );

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: "Save exercise",
      variant: "primary",
      onClick: () => { void this.save(); },
    });
    createButton(actions, {
      label: "Cancel",
      variant: "quiet",
      onClick: () => this.close(),
    });
  }

  /**
   * Pulls muscle groups, equipment and a description off a catalog record so
   * the whole form does not have to be typed by hand.
   */
  private renderCatalogRow(contentEl: HTMLElement): void {
    const linked = this.pickedRecord
      ? toTitleCase(this.pickedRecord.name)
      : this.catalogName
        ? toTitleCase(this.catalogName)
        : null;

    const setting = new Setting(contentEl)
      .setName("Exercise catalog")
      .setDesc(
        linked
          ? `Linked to "${linked}". Muscle groups, equipment and the description come from the catalog.`
          : `Fill this in from one of the ${this.plugin.catalogService.size} bundled exercises instead of typing it.`
      );

    setting.addButton((btn) =>
      btn
        .setButtonText(linked ? "Pick a different one" : "Find in catalog")
        .onClick(() => this.openCatalogPicker())
    );

    if (linked) {
      setting.addButton((btn) =>
        btn.setButtonText("Unlink").onClick(() => {
          this.pickedRecord = undefined;
          this.equipment = undefined;
          this.description = undefined;
          this.source = undefined;
          this.sourceId = undefined;
          this.catalogName = undefined;
          this.mediaId = undefined;
          this.mediaMode = undefined;
          this.render();
        })
      );
    }
  }

  private openCatalogPicker(): void {
    new CatalogPickerModal(
      this.app,
      this.plugin.catalogService.loadIndex(),
      this.plugin.catalogMatcher,
      this.name,
      (record) => this.applyCatalogRecord(record),
      "use this exercise"
    ).open();
  }

  /**
   * Fills the form from a record. The name is only adopted for a brand-new
   * exercise — an existing note is referenced by name from workout notes and
   * the performance CSV, so renaming it here would orphan its logged history.
   */
  private applyCatalogRecord(record: CatalogExercise): void {
    this.pickedRecord = record;

    if (!this.existing) {
      this.name = toTitleCase(record.name);
    }
    if (this.muscleGroups.length === 0) {
      this.muscleGroups = [record.target, ...record.secondaryMuscles].filter(Boolean);
    }
    this.equipment = record.equipment || undefined;
    // Only ever upgrades to cardio, so a deliberate reps-only or duration-only
    // choice is never clobbered.
    if (record.bodyPart === "cardio" && this.type === "strength") {
      this.type = "cardio";
    }

    this.render();
  }

  private async save(): Promise<void> {
    if (!this.name) {
      new Notice("Exercise name is required.");
      return;
    }
    const repsOnly = isRepsOnly(this.type);
    const durationOnly = isDurationOnly(this.type);
    let def: ExerciseDefinition = {
      id: this.existing?.id ?? createIdFromName(this.name),
      name: this.name,
      type: this.type,
      muscleGroups: this.muscleGroups,
      defaultSets: this.defaultSets,
      defaultReps: durationOnly ? undefined : this.defaultReps,
      defaultWeight: durationOnly || repsOnly ? undefined : this.defaultWeight,
      defaultDuration: repsOnly ? undefined : this.defaultDuration,
      defaultDistance: durationOnly || repsOnly ? undefined : this.defaultDistance,
      notes: this.notes || undefined,
      filePath: this.existing?.filePath,
      lastPerformedReps: durationOnly ? undefined : this.existing?.lastPerformedReps,
      lastPerformedWeight:
        durationOnly || repsOnly ? undefined : this.existing?.lastPerformedWeight,
      equipment: this.equipment,
      description: this.description,
      source: this.source,
      sourceId: this.sourceId,
      catalogName: this.catalogName,
      mediaId: this.mediaId,
      mediaMode: this.mediaMode,
    };

    // Resolving the description hits the media service, so it only happens for
    // a record picked in this session — not on every save of a linked note.
    if (this.pickedRecord) {
      try {
        def = await this.plugin.catalogImportService.enrichDefinition(def, this.pickedRecord);
      } catch (error) {
        console.error("Workout Journal: could not read the catalog entry", error);
        new Notice("Could not read that catalog entry. Saving without it.");
      }
    }

    await this.plugin.definitionService.createExerciseDefinition(def);
    new Notice(`Exercise saved: ${def.name}`);
    this.onSave();
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
