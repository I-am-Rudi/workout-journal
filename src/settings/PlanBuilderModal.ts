import { App, Modal, Notice, Setting } from "obsidian";
import WorkoutTrackerPlugin from "../plugin";
import { RoutineDefinition, WorkoutPlanDefinition, WorkoutPlanRoutineEntry } from "../types";
import { createIdFromName } from "../utils/idUtils";

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

    contentEl.createEl("h2", { text: this.existingPlan ? "Edit workout plan" : "Create workout plan" });

    new Setting(contentEl)
      .setName("Plan name")
      .addText((text) =>
        text.setPlaceholder("e.g. Push/Pull/Legs").setValue(this.planName).onChange((value) => {
          this.planName = value.trim();
        })
      );

    contentEl.createEl("h3", { text: "Routines" });

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

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText(this.existingPlan ? "Update plan" : "Save plan")
        .setCta()
        .onClick(() => {
          void this.savePlan();
        })
    );
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
      container.createEl("p", {
        text: "No routines added yet.",
        cls: "setting-item-description",
      });
      return;
    }

    this.selectedEntries.forEach((entry, index) => {
      const row = new Setting(container)
        .setName(entry.routineName)
        .addText((text) =>
          text
            .setPlaceholder("Day (e.g. Monday)")
            .setValue(entry.day ?? "")
            .onChange((value) => {
              this.selectedEntries[index].day = value;
            })
        )
        .addButton((btn) =>
          btn
            .setButtonText("Remove")
            .setWarning()
            .onClick(() => {
              this.selectedEntries.splice(index, 1);
              this.renderEntries(container);
            })
        );
      row.setDesc("Optional day label");
    });
  }
}
