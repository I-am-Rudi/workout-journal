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
    onChoose: (record: CatalogExercise) => void,
    /** What pressing enter does, for the instruction strip. */
    chooseLabel = "attach description"
  ) {
    super(app);
    this.records = records;
    this.onChoose = onChoose;

    // The matcher ranks over the whole catalog, so its hits are intersected
    // with `records` — a caller that passes a subset (a cardio-only picker,
    // say) must not have the ranking smuggle the rest back in.
    const allowed = new Set(records.map((record) => record.id));
    const ranked = seed
      ? matcher
          .rankCandidates(seed, 25)
          .filter((match) => allowed.has(match.record.id))
      : [];
    const seen = new Set(ranked.map((match) => match.record.id));
    this.ordered = [
      ...ranked.map((match) => match.record),
      ...records.filter((record) => !seen.has(record.id)),
    ];

    this.setPlaceholder("Search the exercise catalog…");
    this.setInstructions([
      { command: "↑↓", purpose: "browse" },
      { command: "↵", purpose: chooseLabel },
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
