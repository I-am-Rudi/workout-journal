import { App, Notice, TFile } from "obsidian";
import { ExerciseDefinition, ExerciseType, WorkoutTrackerSettings } from "../types";
import { CatalogExercise, CatalogService, CATALOG_SOURCE_KEY } from "./catalogService";
import { DefinitionFileService } from "./definitionFileService";
import {
  ExerciseMediaService,
  composeDescription,
} from "./exerciseMediaService";
import { writeDescriptionSection } from "./exerciseNoteSections";
import { toTitleCase } from "./titleCase";
import { createIdFromName } from "./idUtils";

export interface CatalogImportResult {
  file: TFile | null;
  definition: ExerciseDefinition;
  skipped: boolean;
}

/**
 * Turns catalog records into exercise notes.
 *
 * Everything it creates is stamped with `wj-source` and `wj-source-id`, and
 * nothing without those keys is ever modified here. That is the whole
 * non-interference guarantee: notes the user made by hand are invisible to the
 * importer, and re-importing is idempotent.
 */
export class CatalogImportService {
  private app: App;
  private catalog: CatalogService;
  private definitions: DefinitionFileService;
  private media: ExerciseMediaService;
  private settings: WorkoutTrackerSettings;

  constructor(
    app: App,
    catalog: CatalogService,
    definitions: DefinitionFileService,
    media: ExerciseMediaService,
    settings: WorkoutTrackerSettings
  ) {
    this.app = app;
    this.catalog = catalog;
    this.definitions = definitions;
    this.media = media;
    this.settings = settings;
  }

  setSettings(settings: WorkoutTrackerSettings): void {
    this.settings = settings;
  }

  /**
   * The dataset carries no sets/reps and no notion of reps-only or
   * duration-only, so only the cardio split can be derived. Everything else
   * starts as strength and the user adjusts it in the import preview.
   */
  private deriveType(record: CatalogExercise): ExerciseType {
    return record.bodyPart === "cardio" ? "cardio" : "strength";
  }

  /** Builds the description block: picture, instructions, then the notice. */
  async buildDescription(record: CatalogExercise): Promise<string> {
    const media = await this.media.resolveMedia(
      record,
      this.settings.exerciseImageMode,
      this.settings.exerciseLibraryFolder,
      this.settings.exerciseImageAnimated
    );
    return composeDescription(media, this.catalog.getDescription(record.id));
  }

  /**
   * Fields a catalog record contributes to a definition. `name` is deliberately
   * excluded — see importRecord and enrichDefinition for who names the note.
   */
  private async catalogFields(
    record: CatalogExercise
  ): Promise<Partial<ExerciseDefinition>> {
    return {
      type: this.deriveType(record),
      muscleGroups: [record.target, ...record.secondaryMuscles].filter(Boolean),
      equipment: record.equipment,
      description: await this.buildDescription(record),
      source: CATALOG_SOURCE_KEY,
      sourceId: record.id,
      catalogName: record.name,
      mediaId: record.mediaId || undefined,
      mediaMode: record.mediaId ? this.settings.exerciseImageMode : undefined,
    };
  }

  /** Existing notes already linked to a catalog id, keyed by that id. */
  async existingBySourceId(): Promise<Map<string, ExerciseDefinition>> {
    const defs = await this.definitions.loadExerciseDefinitions();
    return new Map(
      defs
        .filter((def): def is ExerciseDefinition & { sourceId: string } =>
          Boolean(def.sourceId)
        )
        .map((def) => [def.sourceId, def])
    );
  }

  /**
   * Creates a new exercise note from a catalog record.
   *
   * This is the only path that takes the catalog's name — a brand-new note has
   * no logged history to orphan, so it gets the title-cased catalog name.
   */
  async importRecord(
    record: CatalogExercise,
    options: { typeOverride?: ExerciseType; existing?: ExerciseDefinition } = {}
  ): Promise<CatalogImportResult> {
    if (options.existing) {
      return { file: null, definition: options.existing, skipped: true };
    }

    const name = toTitleCase(record.name);
    const fields = await this.catalogFields(record);
    const definition: ExerciseDefinition = {
      ...fields,
      id: `ds-${record.id}`,
      name,
      // Explicit keys come after the spread: an override from the import
      // preview has to win over the type derived from the dataset.
      type: options.typeOverride ?? fields.type ?? "strength",
      muscleGroups: fields.muscleGroups ?? [],
    };

    const file = await this.definitions.createExerciseDefinition(definition);
    return { file, definition, skipped: false };
  }

  /**
   * Attaches a catalog record to an exercise note that already exists.
   *
   * The note's name is never touched. Workout notes and the performance CSV
   * reference exercises by name, and both `getLatestSetsForExercise()` and the
   * history tab match on it — renaming would silently orphan every logged set.
   * Muscle groups and equipment only fill in when empty, so values the user set
   * themselves survive.
   */
  async enrichExistingNote(
    file: TFile,
    record: CatalogExercise,
    options: { fillEmptyFields?: boolean } = {}
  ): Promise<void> {
    const description = await this.buildDescription(record);

    await this.app.vault.process(file, (content) =>
      writeDescriptionSection(content, description)
    );

    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      frontmatter["wj-source"] = CATALOG_SOURCE_KEY;
      frontmatter["wj-source-id"] = record.id;
      frontmatter["wj-catalog-name"] = record.name;
      if (record.mediaId) {
        frontmatter["wj-media-id"] = record.mediaId;
        frontmatter["wj-media-mode"] = this.settings.exerciseImageMode;
      }

      if (options.fillEmptyFields !== false) {
        const existingGroups = frontmatter["wj-muscle-groups"];
        if (!Array.isArray(existingGroups) || existingGroups.length === 0) {
          frontmatter["wj-muscle-groups"] = [
            record.target,
            ...record.secondaryMuscles,
          ].filter(Boolean);
        }
        if (!frontmatter["wj-equipment"] && record.equipment) {
          frontmatter["wj-equipment"] = record.equipment;
        }
      }
    });
  }

  /**
   * Builds a definition for a name that came from somewhere else (a Strong
   * import), enriched from the catalog but keeping the original name and id.
   */
  async enrichDefinition(
    definition: ExerciseDefinition,
    record: CatalogExercise
  ): Promise<ExerciseDefinition> {
    const fields = await this.catalogFields(record);
    return {
      ...definition,
      ...fields,
      // The imported name and id win: they are what the logged history uses.
      id: definition.id || createIdFromName(definition.name),
      name: definition.name,
      muscleGroups: definition.muscleGroups.length
        ? definition.muscleGroups
        : fields.muscleGroups ?? [],
      type: definition.type !== "other" ? definition.type : fields.type ?? "other",
    };
  }

  notifyImported(count: number): void {
    if (count === 1) {
      new Notice("Imported 1 exercise from the catalog.");
    } else if (count > 1) {
      new Notice(`Imported ${count} exercises from the catalog.`);
    }
  }
}
