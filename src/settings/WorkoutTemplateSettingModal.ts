import { App, Modal, Notice, Setting } from 'obsidian';
import { ExerciseDefinition, WorkoutTemplate } from '../types';
import WorkoutTrackerPlugin from '../plugin';

export class WorkoutTemplateSettingModal extends Modal {
	plugin: WorkoutTrackerPlugin;
	template: WorkoutTemplate;
	onSave: () => void;

	private allExercises: ExerciseDefinition[] = [];
	private searchQuery = "";
	private selectedEl: HTMLElement;
	private listEl: HTMLElement;

	constructor(app: App, plugin: WorkoutTrackerPlugin, onSave: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSave = onSave;
		this.template = {
			name: '',
			exercises: [],
			estimatedDuration: 60
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Add Workout Template" });

		new Setting(contentEl)
			.setName('Template Name')
			.addText(text => text
				.setPlaceholder('Push Day')
				.onChange((value) => {
					this.template.name = value;
				}));

		new Setting(contentEl)
			.setName('Estimated Duration (minutes)')
			.addText(text => text
				.setPlaceholder('60')
				.setValue(this.template.estimatedDuration.toString())
				.onChange((value) => {
					this.template.estimatedDuration = value ? parseInt(value) : 60;
				}));

		// Selected exercises display
		contentEl.createEl("p", { text: "Selected Exercises", cls: "wt-template-exercises-label" });
		this.selectedEl = contentEl.createDiv({ cls: "wt-template-selected-exercises" });
		this.renderSelected();

		// Search + picker
		contentEl.createEl("p", { text: "Add from Library", cls: "wt-template-exercises-label" });
		new Setting(contentEl).setName("Search").addText((text) => {
			text.setPlaceholder("Type to filter exercises…").onChange((value) => {
				this.searchQuery = value;
				this.renderList();
			});
			setTimeout(() => text.inputEl.focus(), 50);
		});

		this.listEl = contentEl.createDiv({ cls: "workout-add-exercise-list" });

		// Load exercises asynchronously then render list
		this.loadExercises();

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Save Template')
				.setCta()
				.onClick(async () => {
					if (!this.template.name) {
						new Notice('Please enter a template name');
					} else if (this.template.exercises.length === 0) {
						new Notice('Please add at least one exercise');
					} else {
						this.plugin.settings.workoutTemplates.push(this.template);
						await this.plugin.saveSettings();
						this.onSave();
						this.close();
					}
				}));
	}

	private async loadExercises(): Promise<void> {
		this.allExercises = await this.plugin.definitionService.loadExerciseDefinitions();
		this.renderList();
	}

	private renderSelected() {
		this.selectedEl.empty();
		if (this.template.exercises.length === 0) {
			this.selectedEl.createEl("p", {
				text: "No exercises selected.",
				cls: "workout-add-exercise-empty",
			});
			return;
		}
		this.template.exercises.forEach((name) => {
			const chip = this.selectedEl.createDiv({ cls: "wt-template-exercise-chip" });
			chip.createEl("span", { text: name });
			const removeBtn = chip.createEl("button", { text: "✕", cls: "wt-template-exercise-chip-remove" });
			removeBtn.onclick = () => {
				this.template.exercises = this.template.exercises.filter(n => n !== name);
				this.renderSelected();
				this.renderList();
			};
		});
	}

	private renderList() {
		this.listEl.empty();
		const q = this.searchQuery.toLowerCase();
		const selected = new Set(this.template.exercises);
		const filtered = this.allExercises.filter(
			(ex) =>
				!selected.has(ex.name) &&
				(!q || ex.name.toLowerCase().includes(q) || ex.muscleGroups.some((mg) => mg.toLowerCase().includes(q)))
		);

		if (filtered.length === 0) {
			this.listEl.createEl("p", { text: "No exercises found.", cls: "workout-add-exercise-empty" });
			return;
		}

		filtered.forEach((ex) => {
			const item = this.listEl.createDiv({ cls: "workout-add-exercise-item" });
			item.createEl("span", { text: ex.name, cls: "workout-add-exercise-name" });
			if (ex.muscleGroups?.length) {
				item.createEl("small", {
					text: ex.muscleGroups.join(", "),
					cls: "workout-add-exercise-muscles",
				});
			}
			item.addEventListener("click", () => {
				this.template.exercises.push(ex.name);
				this.renderSelected();
				this.renderList();
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
