import { setIcon, setTooltip } from "obsidian";

/**
 * The building blocks every plugin surface is assembled from.
 *
 * The session view and the home page settled the visual language — flat filled
 * cards, small uppercase section labels, boxes with rounded corners, and one
 * graded button set. These helpers put the same pieces in reach of the modals
 * and settings pages so nothing has to reinvent (or drift away from) it.
 * The matching CSS lives under "Shared surface kit" in styles.css.
 */

/**
 * Action weight, strongest first. `accent` is the full accent, for the one
 * button on a page that is the reason to be there; `primary` is softened a
 * touch so a modal's confirm stays calm beside its cancel. Danger is a wash,
 * never a red slab.
 */
export type ButtonVariant =
  | "accent"
  | "primary"
  | "secondary"
  | "quiet"
  | "danger"
  | "ghost";

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  icon?: string;
  tooltip?: string;
  disabled?: boolean;
  /** Stretches the button across its container, as on the home page. */
  block?: boolean;
  onClick?: () => void;
}

export interface RowOptions {
  title: string;
  meta?: string;
  /** Short pill-shaped tags shown before the title, such as a day label. */
  leadingChips?: Array<{ text: string; accent?: boolean }>;
  /** Short pill-shaped tags shown after the title. */
  chips?: Array<{ text: string; accent?: boolean }>;
  /** Dims the title — used for rows that point at something missing. */
  muted?: boolean;
  /** Makes the whole row clickable. */
  onClick?: () => void;
}

export interface RowParts {
  row: HTMLElement;
  info: HTMLElement;
  titleLine: HTMLElement;
  actions: HTMLElement;
}

/**
 * Marks a modal as owned by the plugin.
 *
 * `wj-modal` is what switches Obsidian's default form rows over to the flat
 * treatment, so every modal that shows a `Setting` needs it.
 */
export function markPluginModal(contentEl: HTMLElement, extraClass?: string): void {
  contentEl.addClass("wj-modal");
  if (extraClass) contentEl.addClass(extraClass);
}

/**
 * The header block: title, optional subtitle, and a slot for icon actions.
 * Replaces the bare `<h2>` every modal used to open with.
 */
export function renderHeader(
  parent: HTMLElement,
  options: { title: string; subtitle?: string }
): HTMLElement {
  const header = parent.createDiv({ cls: "wj-header" });
  const titles = header.createDiv({ cls: "wj-header-titles" });
  titles.createDiv({ text: options.title, cls: "wj-title" });
  if (options.subtitle) {
    titles.createDiv({ text: options.subtitle, cls: "wj-subtitle" });
  }
  return header.createDiv({ cls: "wj-header-actions" });
}

/** A labelled stack of rows or cards. */
export function createSection(parent: HTMLElement, label?: string): HTMLElement {
  const section = parent.createDiv({ cls: "wj-section" });
  if (label) section.createDiv({ text: label, cls: "wj-section-label" });
  return section;
}

export function createSectionLabel(parent: HTMLElement, text: string): HTMLElement {
  return parent.createDiv({ text, cls: "wj-section-label" });
}

/**
 * A section label with an action on the far right. The label carries the
 * heading role, so the structure is still readable to a screen reader.
 */
export function createSectionHeader(
  parent: HTMLElement,
  title: string
): { header: HTMLElement; label: HTMLElement } {
  const header = parent.createDiv({ cls: "wj-section-header" });
  const label = header.createDiv({ text: title, cls: "wj-section-label" });
  label.setAttr("role", "heading");
  label.setAttr("aria-level", "3");
  return { header, label };
}

export function createCard(parent: HTMLElement, extraClass?: string): HTMLElement {
  return parent.createDiv({
    cls: extraClass ? `wj-card ${extraClass}` : "wj-card",
  });
}

export function createList(parent: HTMLElement): HTMLElement {
  return parent.createDiv({ cls: "wj-list" });
}

/** The plugin's basic list item: title, muted meta line, controls on the right. */
export function createRow(parent: HTMLElement, options: RowOptions): RowParts {
  const row = parent.createDiv({ cls: "wj-row" });
  if (options.muted) row.addClass("wj-row-is-muted");

  const info = row.createDiv({ cls: "wj-row-info" });
  const titleLine = info.createDiv({ cls: "wj-row-title-line" });
  const addChip = (chip: { text: string; accent?: boolean }) => {
    titleLine.createSpan({
      text: chip.text,
      cls: chip.accent ? "wj-chip wj-chip-accent" : "wj-chip",
    });
  };
  for (const chip of options.leadingChips ?? []) addChip(chip);
  titleLine.createDiv({ text: options.title, cls: "wj-row-title" });
  for (const chip of options.chips ?? []) addChip(chip);
  if (options.meta) {
    info.createDiv({ text: options.meta, cls: "wj-row-meta" });
  }

  const actions = row.createDiv({ cls: "wj-row-actions" });

  if (options.onClick) {
    row.addClass("wj-row-clickable");
    row.addEventListener("click", (event) => {
      // A click on a control inside the row belongs to that control.
      if (event.target instanceof HTMLElement && event.target.closest("button")) {
        return;
      }
      options.onClick?.();
    });
  }

  return { row, info, titleLine, actions };
}

export function createButton(
  parent: HTMLElement,
  options: ButtonOptions
): HTMLButtonElement {
  const classes = ["wj-btn", `wj-btn-${options.variant ?? "secondary"}`];
  if (options.block) classes.push("wj-btn-block");
  const button = parent.createEl("button", { cls: classes.join(" ") });
  if (options.icon) {
    setIcon(button.createSpan({ cls: "wj-btn-icon" }), options.icon);
  }
  button.createSpan({ text: options.label });
  if (options.tooltip) setTooltip(button, options.tooltip);
  if (options.disabled) button.disabled = true;
  if (options.onClick) button.onclick = options.onClick;
  return button;
}

export function createIconButton(
  parent: HTMLElement,
  icon: string,
  tooltip: string,
  onClick: () => void,
  options?: { danger?: boolean; disabled?: boolean }
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: options?.danger ? "wj-icon-btn wj-icon-btn-danger" : "wj-icon-btn",
  });
  setIcon(button, icon);
  setTooltip(button, tooltip);
  button.setAttr("aria-label", tooltip);
  if (options?.disabled) button.disabled = true;
  button.onclick = onClick;
  return button;
}

/**
 * The footer bar. Buttons share the width, so the row reads as one bar rather
 * than a pair of floating slabs.
 */
export function createActionBar(parent: HTMLElement): HTMLElement {
  return parent.createDiv({ cls: "wj-actions" });
}

/** "← Back" affordance used by the settings sub-pages. */
export function createBackButton(
  parent: HTMLElement,
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const button = createButton(parent, {
    label,
    variant: "quiet",
    icon: "arrow-left",
    onClick,
  });
  button.addClass("wj-back");
  return button;
}

/** Muted explanatory paragraph. `inset` puts it on a filled card. */
export function createNote(
  parent: HTMLElement,
  text: string,
  variant?: "plain" | "inset" | "accent" | "warning"
): HTMLElement {
  const suffix =
    variant && variant !== "plain" ? ` wj-note-${variant}` : "";
  return parent.createDiv({ text, cls: `wj-note${suffix}` });
}

/** The dashed panel shown when a whole list has nothing in it yet. */
export function createEmptyState(
  parent: HTMLElement,
  options: { title: string; body?: string }
): HTMLElement {
  const empty = parent.createDiv({ cls: "wj-empty" });
  empty.createDiv({ text: options.title, cls: "wj-empty-title" });
  if (options.body) empty.createDiv({ text: options.body, cls: "wj-empty-body" });
  return empty;
}

/** The button row under an empty state's message. */
export function createEmptyActions(empty: HTMLElement): HTMLElement {
  return empty.createDiv({ cls: "wj-empty-actions" });
}

/** One-line placeholder for a list that is merely empty. */
export function createHint(parent: HTMLElement, text: string): HTMLElement {
  return parent.createDiv({ text, cls: "wj-hint" });
}

export function createStatGrid(parent: HTMLElement): HTMLElement {
  return parent.createDiv({ cls: "wj-stat-grid" });
}

export function createStatTile(
  grid: HTMLElement,
  label: string,
  value: string,
  unit?: string
): HTMLElement {
  const tile = grid.createDiv({ cls: "wj-stat" });
  tile.createDiv({ text: label, cls: "wj-stat-label" });
  const valueEl = tile.createDiv({ cls: "wj-stat-value" });
  valueEl.createSpan({ text: value });
  if (unit) valueEl.createSpan({ text: ` ${unit}`, cls: "wj-stat-unit" });
  return tile;
}

/** Flat segmented control, the replacement for underlined tab strips. */
export function createTabs<T extends string>(
  parent: HTMLElement,
  tabs: Array<{ id: T; label: string }>,
  onSelect: (id: T) => void
): Map<T, HTMLElement> {
  const strip = parent.createDiv({ cls: "wj-tabs" });
  const buttons = new Map<T, HTMLElement>();
  for (const tab of tabs) {
    const button = strip.createEl("button", { text: tab.label, cls: "wj-tab" });
    button.onclick = () => onSelect(tab.id);
    buttons.set(tab.id, button);
  }
  return buttons;
}

export function setActiveTab<T extends string>(
  buttons: Map<T, HTMLElement>,
  active: T
): void {
  buttons.forEach((button, id) => {
    button.toggleClass("wj-tab-active", id === active);
  });
}
