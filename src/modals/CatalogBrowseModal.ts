import { App, Modal, Notice, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { CatalogExercise } from "../utils/catalogService";
import { toTitleCase } from "../utils/titleCase";
import { ExerciseDefinition } from "../types";

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
  private importBtn: HTMLButtonElement | null = null;

  constructor(app: App, plugin: WorkoutTrackerPlugin, onDone: () => void) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("wj-catalog-browse-modal");

    new Setting(contentEl).setName("Exercise catalog").setHeading();
    contentEl.createEl("p", {
      text: `${this.plugin.catalogService.size} exercises. Pick the ones you want — only those become notes in your vault.`,
      cls: "setting-item-description",
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

    this.countEl = contentEl.createEl("p", { cls: "setting-item-description" });
    this.listEl = contentEl.createDiv({ cls: "wj-catalog-browse-list" });

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText("Import selected")
          .setCta()
          .onClick(() => void this.importSelected());
        this.importBtn = btn.buttonEl;
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

    this.countEl.setText(
      results.length > MAX_ROWS
        ? `${results.length} matches — showing the first ${MAX_ROWS}. Narrow the filters to see the rest.`
        : `${results.length} ${results.length === 1 ? "match" : "matches"}`
    );

    for (const record of results.slice(0, MAX_ROWS)) {
      const row = this.listEl.createDiv({ cls: "wj-catalog-browse-row" });
      const alreadyHave = this.existing.get(record.id);

      const label = row.createEl("label", { cls: "wj-catalog-browse-label" });
      const checkbox = label.createEl("input", { cls: "wj-catalog-browse-check" });
      checkbox.type = "checkbox";
      checkbox.checked = this.selected.has(record.id);
      checkbox.disabled = Boolean(alreadyHave);
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.selected.add(record.id);
        } else {
          this.selected.delete(record.id);
        }
        this.updateImportButton();
      };

      const text = label.createDiv({ cls: "wj-catalog-browse-text" });
      text.createDiv({ text: toTitleCase(record.name), cls: "wj-catalog-browse-name" });
      text.createDiv({
        text: alreadyHave
          ? `Already in your library as "${alreadyHave.name}"`
          : [record.equipment, record.target].filter(Boolean).join(" · "),
        cls: "wj-catalog-browse-meta",
      });
    }

    this.updateImportButton();
  }

  private updateImportButton(): void {
    if (!this.importBtn) return;
    const count = this.selected.size;
    this.importBtn.disabled = count === 0;
    this.importBtn.setText(count ? `Import ${count}` : "Import selected");
  }

  private async importSelected(): Promise<void> {
    const ids = [...this.selected];
    if (!ids.length) return;

    if (this.importBtn) this.importBtn.disabled = true;
    let imported = 0;

    for (const id of ids) {
      const record = this.plugin.catalogService.getById(id);
      if (!record) continue;
      try {
        const result = await this.plugin.catalogImportService.importRecord(record, {
          existing: this.existing.get(id),
        });
        if (!result.skipped) imported++;
      } catch (error) {
        console.error(`Workout Journal: could not import "${record.name}"`, error);
      }
    }

    new Notice(
      imported === 1
        ? "Imported 1 exercise."
        : `Imported ${imported} exercises.`
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
