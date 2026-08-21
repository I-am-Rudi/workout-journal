import { App, Modal, Notice, TFile } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { ExerciseSet, Workout } from "../types";

/** How many past workouts the history tab lists. */
const HISTORY_LIMIT = 12;

/**
 * Splits a note's raw content into the preserved prefix (frontmatter + H1 line)
 * and the editable body that comes after it.
 */
function splitNoteContent(content: string): { prefix: string; body: string } {
  // Match the YAML frontmatter block
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  if (!fmMatch) {
    return { prefix: "", body: content };
  }
  const afterFm = content.slice(fmMatch[0].length);

  // Match an optional blank line + H1 heading + optional newline
  const titleMatch = afterFm.match(/^\n*# [^\n]*\n?/);
  if (!titleMatch) {
    return { prefix: fmMatch[0], body: afterFm };
  }

  const prefix = fmMatch[0] + titleMatch[0];
  const body = afterFm.slice(titleMatch[0].length);
  return { prefix, body };
}

type NoteTab = "note" | "history";

export class ExerciseNoteModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private filePath: string;
  private exerciseName: string;
  private tab: NoteTab = "note";
  private bodyEl: HTMLElement | null = null;
  private tabButtons: Map<NoteTab, HTMLElement> = new Map();
  /** Loaded lazily on first visit to the history tab, then reused. */
  private history: Workout[] | null = null;
  /** duration-only exercises log seconds; cardio logs minutes. */
  private durationUnit = "min";

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    filePath: string,
    exerciseName: string
  ) {
    super(app);
    this.plugin = plugin;
    this.filePath = filePath;
    this.exerciseName = exerciseName;
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

    this.bodyEl = contentEl.createDiv({ cls: "exercise-note-modal-body" });
    this.setTab("note");
  }

  private setTab(tab: NoteTab): void {
    this.tab = tab;
    this.tabButtons.forEach((btn, key) => {
      btn.toggleClass("exercise-note-modal-tab-active", key === tab);
    });
    if (tab === "note") {
      void this.renderNote();
    } else {
      void this.renderHistory();
    }
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
    const { prefix, body } = splitNoteContent(raw);

    const textarea = container.createEl("textarea", {
      cls: "exercise-note-modal-textarea",
    });
    textarea.value = body;
    // Focus and move cursor to end after rendering
    window.requestAnimationFrame(() => {
      if (this.tab !== "note") return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });

    const footer = container.createDiv({ cls: "exercise-note-modal-footer" });

    const saveBtn = footer.createEl("button", {
      text: "Save",
      cls: "mod-cta exercise-note-modal-save",
    });
    saveBtn.onclick = async () => {
      const newContent = prefix + textarea.value;
      await this.app.vault.modify(file, newContent);
      new Notice(`Saved note for "${this.exerciseName}".`);
      this.close();
    };

    const cancelBtn = footer.createEl("button", {
      text: "Cancel",
      cls: "exercise-note-modal-cancel",
    });
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
    if (set.distance !== undefined) parts.push(`${set.distance} km`);
    return parts.length ? parts.join(" · ") : "—";
  }

  onClose() {
    this.contentEl.empty();
  }
}
