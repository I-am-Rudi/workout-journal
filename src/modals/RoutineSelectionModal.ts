import { App, Modal } from "obsidian";
import { RoutineDefinition } from "../types";
import {
  createButton,
  createEmptyState,
  createList,
  createRow,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

export class RoutineSelectionModal extends Modal {
  routines: RoutineDefinition[];
  onSelect: (routine: RoutineDefinition) => void;

  constructor(
    app: App,
    routines: RoutineDefinition[],
    onSelect: (routine: RoutineDefinition) => void
  ) {
    super(app);
    this.routines = routines;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    markPluginModal(contentEl);

    renderHeader(contentEl, {
      title: "Start from routine",
      subtitle: "Pick the routine you are training today",
    });

    if (this.routines.length === 0) {
      createEmptyState(contentEl, {
        title: "No routines yet",
        body: "Create a routine note to start a guided session from it.",
      });
      return;
    }

    const list = createList(contentEl);
    this.routines.forEach((routine) => {
      const meta = [
        `${routine.exercises.length} exercise${routine.exercises.length === 1 ? "" : "s"}`,
        routine.estimatedDuration ? `~${routine.estimatedDuration} min` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const { actions } = createRow(list, {
        title: routine.name,
        meta,
        chips: routine.isCircle ? [{ text: "Circuit", accent: true }] : undefined,
      });
      createButton(actions, {
        label: "Start",
        variant: "secondary",
        onClick: () => {
          this.onSelect(routine);
          this.close();
        },
      });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
