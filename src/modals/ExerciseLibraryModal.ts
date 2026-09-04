import { App, Modal, Notice, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { ExerciseDefinition } from "../types";
import { CatalogExercise } from "../utils/catalogService";
import { toTitleCase } from "../utils/titleCase";
import { CatalogPickerModal } from "./CatalogPickerModal";
import { ExerciseDefinitionModal } from "./ExerciseDefinitionModal";
import { ExerciseNoteModal } from "./ExerciseNoteModal";
import { EXERCISE_TYPE_LABELS } from "../utils/exerciseTypeUtils";
import {
  createButton,
  createEmptyState,
  createHint,
  createIconButton,
  createList,
  createRow,
  createSectionLabel,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

/** Catalog suggestions shown inline under the user's own exercises. */
const MAX_CATALOG_MATCHES = 8;

/**
 * The exercise library, opened from the home page.
 *
 * Deliberately the same shape as the in-session picker: one search field that
 * covers both your own notes and the bundled catalog, with importing or
 * creating available from the same list. The difference is what a row does —
 * here it opens the exercise note rather than adding it to a workout.
 */
export class ExerciseLibraryModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private exercises: ExerciseDefinition[] = [];
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
    markPluginModal(contentEl, "wj-library-modal");

    const headerActions = renderHeader(contentEl, {
      title: "Exercise library",
      subtitle: "Search your notes, or pull one in from the catalog",
    });
    createIconButton(headerActions, "plus", "New exercise", () =>
      this.openEditor()
    );

    new Setting(contentEl).setName("Search").addText((text) => {
      text.setPlaceholder("Type to filter exercises…").onChange((value) => {
        this.searchQuery = value;
        this.renderList();
      });
      window.setTimeout(() => text.inputEl.focus(), 50);
    });

    new Setting(contentEl)
      .setName("Not in your library?")
      .setDesc(
        `Search all ${this.plugin.catalogService.size} exercises in the catalog.`
      )
      .addButton((btn) =>
        btn.setButtonText("Search catalog").onClick(() => this.openCatalogSearch())
      );

    this.listEl = contentEl.createDiv({ cls: "wj-picker-list" });
    void this.refresh();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async refresh(): Promise<void> {
    this.exercises = await this.plugin.definitionService.loadExerciseDefinitions();
    this.exercises.sort((a, b) => a.name.localeCompare(b.name));
    this.renderList();
  }

  private renderList(): void {
    const container = this.listEl;
    if (!container) return;
    container.empty();

    const query = this.searchQuery.trim().toLowerCase();
    const filtered = this.exercises.filter(
      (exercise) =>
        !query ||
        exercise.name.toLowerCase().includes(query) ||
        exercise.muscleGroups.some((group) => group.toLowerCase().includes(query))
    );

    if (!this.exercises.length) {
      createEmptyState(container, {
        title: "Your library is empty",
        body: "Create an exercise, or search the catalog for one.",
      });
    } else if (!filtered.length && !query) {
      createHint(container, "No exercises found.");
    }

    if (filtered.length) {
      const list = createList(container);
      for (const exercise of filtered) {
        const meta = [
          exercise.muscleGroups.length ? exercise.muscleGroups.join(", ") : null,
          exercise.defaultSets !== undefined
            ? `${exercise.defaultSets} × ${exercise.defaultReps ?? "?"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

        const { actions } = createRow(list, {
          title: exercise.name,
          meta,
          chips: [{ text: EXERCISE_TYPE_LABELS[exercise.type] }],
          onClick: () => this.openNote(exercise),
        });

        createIconButton(actions, "eye", "Description and history", () =>
          this.openReader(exercise)
        );
        createIconButton(actions, "pencil", "Edit exercise", () =>
          this.openEditor(exercise)
        );
      }
    }

    this.renderCatalogGroup(container, filtered.length);
  }

  /**
   * Catalog matches for whatever has been typed, dimmed and below the user's
   * own exercises — importing one is a side effect of finding it, not a chore
   * of its own.
   */
  private renderCatalogGroup(container: HTMLElement, ownCount: number): void {
    const query = this.searchQuery.trim();
    if (!query) return;

    const owned = new Set(this.exercises.map((ex) => ex.name.toLowerCase()));
    const matches = this.plugin.catalogService
      .loadIndex()
      .filter(
        (record) =>
          record.name.toLowerCase().includes(query.toLowerCase()) &&
          !owned.has(toTitleCase(record.name).toLowerCase())
      )
      .slice(0, MAX_CATALOG_MATCHES);

    if (matches.length) {
      const label = createSectionLabel(
        container,
        ownCount ? "From the exercise catalog" : "Not in your library yet"
      );
      label.addClass("wj-picker-group-label");

      const list = createList(container);
      for (const record of matches) {
        const { row } = createRow(list, {
          title: toTitleCase(record.name),
          meta: [record.equipment, record.target].filter(Boolean).join(", "),
          muted: true,
          onClick: () => {
            void this.importRecord(record);
          },
        });
        row.addClass("wj-row-catalog");
      }
    }

    createButton(container, {
      label: `Create "${query}" as new exercise`,
      variant: "ghost",
      icon: "plus",
      onClick: () => this.openEditor(undefined, query),
    });
  }

  private openCatalogSearch(): void {
    new CatalogPickerModal(
      this.app,
      this.plugin.catalogService.loadIndex(),
      this.plugin.catalogMatcher,
      this.searchQuery.trim(),
      (record) => {
        void this.importRecord(record);
      },
      "add to your library"
    ).open();
  }

  private async importRecord(record: CatalogExercise): Promise<void> {
    try {
      const result = await this.plugin.catalogImportService.importRecord(record);
      const definition = result.file
        ? { ...result.definition, filePath: result.file.path }
        : result.definition;
      new Notice(`Exercise note created: ${definition.name}`);
      await this.refresh();
    } catch (error) {
      console.error("Workout Journal: could not import from the catalog", error);
      new Notice("Could not import that exercise. See the console for details.");
    }
  }

  private openEditor(existing?: ExerciseDefinition, initialName?: string): void {
    new ExerciseDefinitionModal(
      this.app,
      this.plugin,
      () => {
        void this.refresh();
      },
      existing,
      initialName
    ).open();
  }

  /** Tapping a row leaves the dashboard and opens the note itself. */
  private openNote(exercise: ExerciseDefinition): void {
    if (!exercise.filePath) {
      this.openEditor(exercise);
      return;
    }
    this.close();
    this.onNavigate?.();
    void this.app.workspace.openLinkText(exercise.filePath, "", false);
  }

  /**
   * The same reader the session view uses, for when the question is "how does
   * this go again" rather than "let me edit the note".
   */
  private openReader(exercise: ExerciseDefinition): void {
    if (!exercise.filePath) {
      this.openEditor(exercise);
      return;
    }
    new ExerciseNoteModal(
      this.app,
      this.plugin,
      exercise.filePath,
      exercise.name
    ).open();
  }
}
