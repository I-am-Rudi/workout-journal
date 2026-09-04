import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { CatalogExercise } from "../utils/catalogService";
import { toTitleCase } from "../utils/titleCase";
import { ExerciseDefinition } from "../types";
import { createNote, markPluginModal, renderHeader } from "../utils/uiKit";

/** Keeps the list responsive; filters narrow it long before this bites. */
const MAX_ROWS = 300;

/**
 * Deliberate stocking of the exercise library: filter, tick, import.
 *
 * There is no "import everything" button on purpose — the point of the catalog
 * is that the vault only ever grows by what the user actually uses.
 */
export class CatalogBrowseModal extends Modal {
  private plugin: WorkoutTrackerPlugin;
  private onDone: () => void;

  private query = "";
  private bodyPart = "";
  private equipment = "";
  private selected = new Set<string>();
  private existing = new Map<string, ExerciseDefinition>();

  private listEl!: HTMLElement;
  private countEl!: HTMLElement;
  /** The match count without the selection suffix, so both can update alone. */
  private countBase = "";
  // The component, not its element: ButtonComponent gates its own click
  // callback on an internal `disabled` flag, so toggling `buttonEl.disabled`
  // re-enables the button visually while the click stays swallowed.
  private importBtn: ButtonComponent | null = null;

  constructor(app: App, plugin: WorkoutTrackerPlugin, onDone: () => void) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl, "wj-catalog-browse-modal");

    renderHeader(contentEl, {
      title: "Exercise catalog",
      subtitle: `${this.plugin.catalogService.size} exercises — only the ones you pick become notes`,
    });

    this.existing = await this.plugin.catalogImportService.existingBySourceId();
    const facets = this.plugin.catalogService.facets();

    new Setting(contentEl).setName("Search").addText((text) => {
      text.setPlaceholder("Type to filter…").onChange((value) => {
        this.query = value.toLowerCase();
        this.renderList();
      });
      window.setTimeout(() => text.inputEl.focus(), 50);
    });

    new Setting(contentEl).setName("Body part").addDropdown((drop) => {
      drop.addOption("", "All");
      for (const value of facets.bodyParts) drop.addOption(value, value);
      drop.onChange((value) => {
        this.bodyPart = value;
        this.renderList();
      });
    });

    new Setting(contentEl).setName("Equipment").addDropdown((drop) => {
      drop.addOption("", "All");
      for (const value of facets.equipment) drop.addOption(value, value);
      drop.onChange((value) => {
        this.equipment = value;
        this.renderList();
      });
    });

    this.countEl = createNote(contentEl, "");
    this.listEl = contentEl.createDiv({ cls: "wj-catalog-browse-list" });

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText("Import selected")
          .setCta()
          .onClick(() => void this.importSelected());
        this.importBtn = btn;
        btn.setDisabled(true);
      })
      .addButton((btn) => btn.setButtonText("Close").onClick(() => this.close()));

    this.renderList();
  }

  private matches(): CatalogExercise[] {
    return this.plugin.catalogService.loadIndex().filter((record) => {
      if (this.bodyPart && record.bodyPart !== this.bodyPart) return false;
      if (this.equipment && record.equipment !== this.equipment) return false;
      if (!this.query) return true;
      return (
        record.name.toLowerCase().includes(this.query) ||
        record.target.toLowerCase().includes(this.query) ||
        record.equipment.toLowerCase().includes(this.query)
      );
    });
  }

  private renderList(): void {
    const results = this.matches();
    this.listEl.empty();

    this.countBase =
      results.length > MAX_ROWS
        ? `${results.length} matches — showing the first ${MAX_ROWS}. Narrow the filters to see the rest.`
        : `${results.length} ${results.length === 1 ? "match" : "matches"}`;

    for (const record of results.slice(0, MAX_ROWS)) {
      const row = this.listEl.createDiv({ cls: "wj-catalog-browse-row" });
      const alreadyHave = this.existing.get(record.id);
      const name = toTitleCase(record.name);

      // Selection runs through `select()` and nothing else. The rows used to be
      // <label> elements wrapping the checkbox, leaving the tick to the
      // browser's label forwarding, and ticking a second row did not stick.
      // Handling the click on the row and on the checkbox explicitly keeps the
      // set and the boxes in step no matter where the click lands.
      const rowEl = row.createDiv({ cls: "wj-catalog-browse-item" });
      const checkbox = rowEl.createEl("input", {
        type: "checkbox",
        cls: "wj-catalog-browse-check",
      });
      checkbox.checked = this.selected.has(record.id);
      checkbox.disabled = Boolean(alreadyHave);
      checkbox.setAttr("aria-label", name);
      row.toggleClass("is-selected", checkbox.checked);
      if (alreadyHave) row.addClass("is-disabled");

      const select = (on: boolean) => {
        checkbox.checked = on;
        if (on) {
          this.selected.add(record.id);
        } else {
          this.selected.delete(record.id);
        }
        row.toggleClass("is-selected", on);
        this.updateSelection();
      };

      // The checkbox has already flipped itself by the time this runs, so the
      // row handler must not flip it a second time.
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
        select(checkbox.checked);
      });
      rowEl.addEventListener("click", () => {
        if (checkbox.disabled) return;
        select(!checkbox.checked);
      });

      const text = rowEl.createDiv({ cls: "wj-catalog-browse-text" });
      text.createDiv({ text: name, cls: "wj-catalog-browse-name" });
      text.createDiv({
        text: alreadyHave
          ? `Already in your library as "${alreadyHave.name}"`
          : [record.equipment, record.target].filter(Boolean).join(" · "),
        cls: "wj-catalog-browse-meta",
      });
    }

    this.updateSelection();
  }

  /** Reflects the current selection in the count line and the import button. */
  private updateSelection(): void {
    const count = this.selected.size;
    // Ticks survive a filter change, so the running total is spelled out here —
    // otherwise a selection made under an earlier filter looks lost.
    this.countEl.setText(
      count ? `${this.countBase} · ${count} selected` : this.countBase
    );
    // Explicit null check: BaseComponent has a `then()` chaining helper, so a
    // truthiness test on a component trips no-misused-promises.
    if (this.importBtn === null) return;
    this.importBtn.setDisabled(count === 0);
    this.importBtn.setButtonText(count ? `Import ${count}` : "Import selected");
  }

  private async importSelected(): Promise<void> {
    const ids = [...this.selected];
    if (!ids.length) return;

    this.importBtn?.setDisabled(true);
    let imported = 0;
    let failed = 0;

    for (const id of ids) {
      const record = this.plugin.catalogService.getById(id);
      if (!record) continue;
      this.importBtn?.setButtonText(`Importing ${imported + failed + 1}/${ids.length}…`);
      try {
        const result = await this.plugin.catalogImportService.importRecord(record, {
          existing: this.existing.get(id),
        });
        if (!result.skipped) imported++;
      } catch (error) {
        failed++;
        console.error(`Workout Journal: could not import "${record.name}"`, error);
      }
    }

    const summary = imported === 1 ? "Imported 1 exercise." : `Imported ${imported} exercises.`;
    new Notice(
      failed
        ? `${summary} ${failed} failed — see the console for details.`
        : summary
    );
    this.selected.clear();
    this.existing = await this.plugin.catalogImportService.existingBySourceId();
    this.renderList();
    this.onDone();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
