import { App, Modal, Notice, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { RoutineDefinition, WorkoutPlanDefinition, WorkoutPlanRoutineEntry } from "../types";
import { createIdFromName } from "../utils/idUtils";
import {
  createActionBar,
  createButton,
  createHint,
  createIconButton,
  createList,
  createRow,
  createSectionLabel,
  markPluginModal,
  renderHeader,
} from "../utils/uiKit";

export class PlanBuilderModal extends Modal {
  plugin: WorkoutTrackerPlugin;
  availableRoutines: RoutineDefinition[];
  onSave: () => void;
  private existingPlan: WorkoutPlanDefinition | undefined;

  private planName = "";
  private selectedEntries: WorkoutPlanRoutineEntry[] = [];

  constructor(
    app: App,
    plugin: WorkoutTrackerPlugin,
    availableRoutines: RoutineDefinition[],
    onSave: () => void,
    existingPlan?: WorkoutPlanDefinition
  ) {
    super(app);
    this.plugin = plugin;
    this.availableRoutines = availableRoutines;
    this.onSave = onSave;
    this.existingPlan = existingPlan;
    if (existingPlan) {
      this.planName = existingPlan.name;
      this.selectedEntries = existingPlan.routines.map((r) => ({ ...r }));
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    markPluginModal(contentEl);
    renderHeader(contentEl, {
      title: this.existingPlan ? "Edit workout plan" : "Create workout plan",
      subtitle: "A plan groups routines into a training program",
    });

    new Setting(contentEl)
      .setName("Plan name")
      .addText((text) =>
        text.setPlaceholder("e.g. Push/Pull/Legs").setValue(this.planName).onChange((value) => {
          this.planName = value.trim();
        })
      );

    createSectionLabel(contentEl, "Routines");

    const entriesContainer = contentEl.createDiv();
    this.renderEntries(entriesContainer);

    // Routine picker row
    const pickerSetting = new Setting(contentEl).setName("Add routine");

    if (this.availableRoutines.length === 0) {
      pickerSetting.setDesc("No routine notes found. Create routine notes first.");
    } else {
      let pickedRoutineId = this.availableRoutines[0].id;

      pickerSetting.addDropdown((dropdown) => {
        for (const routine of this.availableRoutines) {
          dropdown.addOption(routine.id, routine.name);
        }
        dropdown.setValue(pickedRoutineId);
        dropdown.onChange((value) => {
          pickedRoutineId = value;
        });
      });

      pickerSetting.addButton((btn) =>
        btn.setButtonText("Add").onClick(() => {
          const routine = this.availableRoutines.find((r) => r.id === pickedRoutineId);
          if (!routine) return;
          this.selectedEntries.push({
            routineId: routine.id,
            routineName: routine.name,
            routineLink: routine.filePath
              ? `[[${routine.filePath.replace(/\.md$/, "")}]]`
              : undefined,
            day: "",
            notes: "",
          });
          this.renderEntries(entriesContainer);
        })
      );
    }

    const actions = createActionBar(contentEl);
    createButton(actions, {
      label: this.existingPlan ? "Update plan" : "Save plan",
      variant: "primary",
      onClick: () => {
        void this.savePlan();
      },
    });
    createButton(actions, {
      label: "Cancel",
      variant: "quiet",
      onClick: () => this.close(),
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private async savePlan(): Promise<void> {
    if (!this.planName) {
      new Notice("Please enter a plan name.");
      return;
    }
    if (this.selectedEntries.length === 0) {
      new Notice("Please add at least one routine.");
      return;
    }

    const plan: WorkoutPlanDefinition = {
      id: this.existingPlan?.id ?? createIdFromName(this.planName),
      name: this.planName,
      routines: this.selectedEntries.map((entry) => ({
        ...entry,
        day: entry.day || undefined,
        notes: entry.notes || undefined,
      })),
      filePath: this.existingPlan?.filePath,
    };

    const file = await this.plugin.definitionService.createWorkoutPlanDefinition(plan);
    this.onSave();
    this.close();

    if (file) {
      await this.app.workspace.openLinkText(file.path, "", false);
    }
  }

  private renderEntries(container: HTMLElement): void {
    container.empty();

    if (this.selectedEntries.length === 0) {
      createHint(container, "No routines added yet.");
      return;
    }

    const list = createList(container);
    this.selectedEntries.forEach((entry, index) => {
      const { row, actions } = createRow(list, {
        title: entry.routineName,
        meta: "Optional day label",
      });
      row.addClass("wj-row-editable");

      const dayInput = actions.createEl("input", {
        type: "text",
        cls: "wj-inline-input wj-inline-input-wide",
      });
      dayInput.placeholder = "Day";
      dayInput.value = entry.day ?? "";
      dayInput.setAttr("aria-label", `${entry.routineName} day label`);
      dayInput.addEventListener("input", () => {
        this.selectedEntries[index].day = dayInput.value;
      });

      createIconButton(
        actions,
        "x",
        "Remove routine",
        () => {
          this.selectedEntries.splice(index, 1);
          this.renderEntries(container);
        },
        { danger: true }
      );
    });
  }
}
