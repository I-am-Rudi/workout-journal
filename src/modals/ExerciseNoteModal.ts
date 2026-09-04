import { App, Component, MarkdownRenderer, Modal, Notice, Platform, TFile } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { ExerciseSet, Workout } from "../types";
import { parseExerciseNote, writeNotesSection } from "../utils/exerciseNoteSections";

/** How many past workouts the history tab lists. */
const HISTORY_LIMIT = 12;

type NoteTab = "note" | "history" | "description";

export class ExerciseNoteModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private filePath: string;
  private exerciseName: string;
  /** Told the saved note text, so a caller holding a copy can refresh it. */
  private onSave?: (notes: string) => void;
  private tab: NoteTab = "note";
  private bodyEl: HTMLElement | null = null;
  private tabButtons: Map<NoteTab, HTMLElement> = new Map();
  /** Loaded lazily on first visit to the history tab, then reused. */
  private history: Workout[] | null = null;
  /** duration-only exercises log seconds; cardio logs minutes. */
  private durationUnit = "min";
  /** Owns the lifecycle of anything MarkdownRenderer creates. */
  private renderComponent = new Component();

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    filePath: string,
    exerciseName: string,
    onSave?: (notes: string) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.filePath = filePath;
    this.exerciseName = exerciseName;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("exercise-note-modal");

    contentEl.createEl("h3", {
      text: this.exerciseName,
      cls: "exercise-note-modal-title",
    });

    const tabs = contentEl.createDiv({ cls: "exercise-note-modal-tabs" });
    const addTab = (tab: NoteTab, label: string) => {
      const btn = tabs.createEl("button", {
        text: label,
        cls: "exercise-note-modal-tab",
      });
      btn.onclick = () => this.setTab(tab);
      this.tabButtons.set(tab, btn);
    };
    addTab("note", "Note");
    addTab("history", "History");
    addTab("description", "Description");

    this.bodyEl = contentEl.createDiv({ cls: "exercise-note-modal-body" });
    // MarkdownRenderer needs a Component for its lifecycle and Modal is not one,
    // so the modal owns one and unloads it on close.
    this.renderComponent.load();
    void this.chooseInitialTab();
  }

  private setTab(tab: NoteTab): void {
    this.tab = tab;
    this.tabButtons.forEach((btn, key) => {
      btn.toggleClass("exercise-note-modal-tab-active", key === tab);
    });
    if (tab === "note") {
      void this.renderNote();
    } else if (tab === "description") {
      void this.renderDescription();
    } else {
      void this.renderHistory();
    }
  }

  /**
   * Opens on Description when there is one and the user has not written notes
   * yet — for a freshly imported exercise "how does this go again" is the actual
   * question being asked.
   */
  private async chooseInitialTab(): Promise<void> {
    const sections = await this.readSections();
    this.setTab(sections && sections.description && !sections.notes ? "description" : "note");
  }

  private async readSections() {
    const file = this.app.vault.getFileByPath(this.filePath);
    if (!file) return null;
    return parseExerciseNote(await this.app.vault.read(file));
  }

  private async renderDescription(): Promise<void> {
    const container = this.bodyEl;
    if (!container) return;
    container.empty();

    const file = this.app.vault.getFileByPath(this.filePath);
    if (!file) {
      container.createEl("p", {
        text: "Exercise note file not found.",
        cls: "exercise-note-modal-error",
      });
      return;
    }

    const sections = parseExerciseNote(await this.app.vault.read(file));
    if (this.tab !== "description") return;

    if (!sections.description) {
      const empty = container.createDiv({ cls: "exercise-note-modal-empty" });
      empty.createEl("p", {
        text: "No description yet.",
        cls: "setting-item-description",
      });
      const button = empty.createEl("button", {
        text: "Find this exercise in the catalog",
        cls: "mod-cta",
      });
      button.onclick = () => {
        this.close();
        void this.plugin.attachCatalogDescription(file);
      };
      return;
    }

    const rendered = container.createDiv({ cls: "exercise-note-modal-description" });
    // Rendering through Obsidian resolves embeds and wikilinks against the note,
    // and keeps third-party text off any innerHTML path.
    await MarkdownRenderer.render(
      this.app,
      sections.description,
      rendered,
      this.filePath,
      this.renderComponent
    );
  }

  private async renderNote(): Promise<void> {
    const container = this.bodyEl;
    if (!container) return;
    container.empty();

    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) {
      container.createEl("p", {
        text: "Exercise note file not found.",
        cls: "exercise-note-modal-error",
      });
      return;
    }

    const raw = await this.app.vault.read(file);
    const sections = parseExerciseNote(raw);

    // A fresh wrapper per render, so the tap-to-dismiss listener below cannot
    // stack up as the user moves between tabs.
    const pane = container.createDiv({ cls: "exercise-note-modal-note" });

    // The actions sit above the textarea, not under it: on a phone the
    // on-screen keyboard covers the bottom of the modal for as long as the
    // field has focus, and a Save button down there cannot be reached at all.
    const actions = pane.createDiv({ cls: "exercise-note-modal-actions" });

    // No mod-cta: the accent weighting comes from the plugin's own button
    // system in styles.css, so Obsidian's slab does not have to be fought.
    const saveBtn = actions.createEl("button", {
      text: "Save",
      cls: "exercise-note-modal-save",
    });
    const cancelBtn = actions.createEl("button", {
      text: "Cancel",
      cls: "exercise-note-modal-cancel",
    });

    const textarea = pane.createEl("textarea", {
      cls: "exercise-note-modal-textarea",
    });
    textarea.value = sections.notes;

    // Desktop opens straight into the field; on mobile that would raise the
    // keyboard before the user has said they want to type.
    if (!Platform.isMobile) {
      window.requestAnimationFrame(() => {
        if (this.tab !== "note") return;
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      });
    }

    // Tapping anywhere off the field puts the keyboard away — mobile Obsidian
    // offers no other way out while a textarea holds focus. The buttons are
    // left out of it: they close the modal on their own, and dropping the
    // keyboard mid-press would reflow the layout under the finger.
    pane.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (target === textarea) return;
      if (target instanceof HTMLElement && target.closest("button")) return;
      textarea.blur();
    });

    saveBtn.onclick = async () => {
      // Splices the ## Notes section only. Re-reading inside process() keeps a
      // description added elsewhere in the meantime intact.
      await this.app.vault.process(file, (current) =>
        writeNotesSection(current, textarea.value)
      );
      new Notice(`Saved note for "${this.exerciseName}".`);
      this.onSave?.(textarea.value.trim());
      this.close();
    };

    cancelBtn.onclick = () => this.close();
  }

  private async renderHistory(): Promise<void> {
    const container = this.bodyEl;
    if (!container) return;
    container.empty();

    if (this.history === null) {
      container.createEl("p", {
        text: "Loading history…",
        cls: "exercise-note-modal-loading",
      });
      const file = this.app.vault.getAbstractFileByPath(this.filePath);
      if (file instanceof TFile) {
        const def = await this.plugin.definitionService.loadExerciseFromFile(file);
        this.durationUnit = def?.type === "duration-only" ? "s" : "min";
      }
      const workouts = await this.plugin.fileService.loadAllWorkouts();
      this.history = workouts
        .filter((workout) =>
          workout.exercises.some(
            (exercise) =>
              exercise.name.toLowerCase() === this.exerciseName.toLowerCase()
          )
        )
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, HISTORY_LIMIT);
      // The tab may have been switched away while the vault read was running.
      if (this.tab !== "history") return;
      container.empty();
    }

    if (!this.history.length) {
      container.createEl("p", {
        text: "No logged performances yet.",
        cls: "exercise-note-modal-empty",
      });
      return;
    }

    const list = container.createDiv({ cls: "exercise-history-list" });
    for (const workout of this.history) {
      const entry = list.createDiv({ cls: "exercise-history-entry" });
      const header = entry.createDiv({ cls: "exercise-history-entry-header" });
      header.createSpan({ text: workout.date, cls: "exercise-history-date" });
      header.createSpan({ text: workout.name, cls: "exercise-history-workout" });

      const performed = workout.exercises.filter(
        (exercise) =>
          exercise.name.toLowerCase() === this.exerciseName.toLowerCase()
      );
      for (const exercise of performed) {
        const setsEl = entry.createDiv({ cls: "exercise-history-sets" });
        exercise.sets.forEach((set, index) => {
          setsEl.createSpan({
            text: `${index + 1}. ${this.describeSet(set)}`,
            cls: `exercise-history-set${
              set.setType && set.setType !== "default"
                ? ` exercise-history-set-${set.setType}`
                : ""
            }`,
          });
        });
        if (exercise.notes) {
          entry.createDiv({
            text: exercise.notes,
            cls: "exercise-history-notes",
          });
        }
      }
    }
  }

  private describeSet(set: ExerciseSet): string {
    const parts: string[] = [];
    if (set.weight !== undefined && set.reps !== undefined) {
      parts.push(`${set.weight} ${this.plugin.settings.weightUnit} × ${set.reps}`);
    } else if (set.reps !== undefined) {
      parts.push(`${set.reps} reps`);
    } else if (set.weight !== undefined) {
      parts.push(`${set.weight} ${this.plugin.settings.weightUnit}`);
    }
    if (set.duration !== undefined) parts.push(`${set.duration}${this.durationUnit}`);
    if (set.distance !== undefined) {
      parts.push(`${set.distance} ${this.plugin.settings.distanceUnit}`);
    }
    return parts.length ? parts.join(" · ") : "—";
  }

  onClose() {
    this.renderComponent.unload();
    this.contentEl.empty();
  }
}
