import { App, FuzzySuggestModal, FuzzyMatch } from "obsidian";
import { CatalogExercise } from "../utils/catalogService";
import { CatalogMatcher } from "../utils/catalogMatcher";
import { toTitleCase } from "../utils/titleCase";

/**
 * Search across the whole catalog.
 *
 * Seeded with the name of whatever the user is working on, so the likely
 * candidate is usually already at the top and the interaction is
 * open-palette-press-enter. The initial ordering comes from the matcher; once
 * the user types, Obsidian's own fuzzy filtering takes over.
 */
export class CatalogPickerModal extends FuzzySuggestModal<CatalogExercise> {
  private records: CatalogExercise[];
  private ordered: CatalogExercise[];
  private onChoose: (record: CatalogExercise) => void;

  constructor(
    app: App,
    records: CatalogExercise[],
    matcher: CatalogMatcher,
    seed: string,
    onChoose: (record: CatalogExercise) => void
  ) {
    super(app);
    this.records = records;
    this.onChoose = onChoose;

    const ranked = seed ? matcher.rankCandidates(seed, 25) : [];
    const seen = new Set(ranked.map((match) => match.record.id));
    this.ordered = [
      ...ranked.map((match) => match.record),
      ...records.filter((record) => !seen.has(record.id)),
    ];

    this.setPlaceholder("Search the exercise catalog…");
    this.setInstructions([
      { command: "↑↓", purpose: "browse" },
      { command: "↵", purpose: "attach description" },
      { command: "esc", purpose: "cancel" },
    ]);
  }

  getItems(): CatalogExercise[] {
    return this.ordered;
  }

  getItemText(record: CatalogExercise): string {
    // Equipment and target join the searchable text so "dumbbell chest" works.
    return `${record.name} ${record.equipment} ${record.target}`;
  }

  renderSuggestion(match: FuzzyMatch<CatalogExercise>, el: HTMLElement): void {
    const record = match.item;
    el.createDiv({ text: toTitleCase(record.name), cls: "wj-catalog-suggestion-name" });
    const meta = [record.equipment, record.target, record.bodyPart]
      .filter(Boolean)
      .join(" · ");
    el.createDiv({ text: meta, cls: "wj-catalog-suggestion-meta" });
  }

  onChooseItem(record: CatalogExercise): void {
    this.onChoose(record);
  }
}
