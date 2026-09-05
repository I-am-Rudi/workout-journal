import { App, Modal, Notice, Setting } from 'obsidian';
import { ExerciseDefinition, WorkoutTemplate } from '../types';
import WorkoutTrackerPlugin from '../plugin';
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
} from '../utils/uiKit';

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

		markPluginModal(contentEl);
		renderHeader(contentEl, {
			title: "Add workout template",
			subtitle: "A named list of exercises for one-tap logging",
		});

		new Setting(contentEl)
			.setName('Template name')
			.addText(text => text
				.setPlaceholder('Push day')
				.onChange((value) => {
					this.template.name = value;
				}));

		new Setting(contentEl)
			.setName('Estimated duration (minutes)')
			.addText(text => text
				.setPlaceholder('60')
				.setValue(this.template.estimatedDuration.toString())
				.onChange((value) => {
					this.template.estimatedDuration = value ? parseInt(value) : 60;
				}));

		// Selected exercises display
		createSectionLabel(contentEl, "Selected exercises");
		this.selectedEl = contentEl.createDiv({ cls: "wj-chip-row" });
		this.renderSelected();

		// Search + picker
		createSectionLabel(contentEl, "Add from library");
		new Setting(contentEl).setName("Search").addText((text) => {
			text.setPlaceholder("Type to filter exercises…").onChange((value) => {
				this.searchQuery = value;
				this.renderList();
			});
			window.setTimeout(() => text.inputEl.focus(), 50);
		});

		this.listEl = contentEl.createDiv({ cls: "wj-picker-list" });

		// Load exercises asynchronously then render list
		void this.loadExercises();

		const actions = createActionBar(contentEl);
		createButton(actions, {
			label: 'Save template',
			variant: 'primary',
			onClick: () => {
				void (async () => {
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
				})();
			},
		});
		createButton(actions, {
			label: 'Cancel',
			variant: 'quiet',
			onClick: () => this.close(),
		});
	}

	private async loadExercises(): Promise<void> {
		this.allExercises = await this.plugin.definitionService.loadExerciseDefinitions();
		this.renderList();
	}

	private renderSelected() {
		this.selectedEl.empty();
		if (this.template.exercises.length === 0) {
			createHint(this.selectedEl, "No exercises selected.");
			return;
		}
		this.template.exercises.forEach((name) => {
			const chip = this.selectedEl.createDiv({ cls: "wj-chip wj-chip-removable" });
			chip.createSpan({ text: name });
			createIconButton(
				chip,
				"x",
				`Remove ${name}`,
				() => {
					this.template.exercises = this.template.exercises.filter(n => n !== name);
					this.renderSelected();
					this.renderList();
				}
			);
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
			createHint(this.listEl, "No exercises found.");
			return;
		}

		const list = createList(this.listEl);
		filtered.forEach((ex) => {
			createRow(list, {
				title: ex.name,
				meta: ex.muscleGroups?.length ? ex.muscleGroups.join(", ") : undefined,
				onClick: () => {
					this.template.exercises.push(ex.name);
					this.renderSelected();
					this.renderList();
				},
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
