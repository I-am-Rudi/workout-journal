import { App, Modal, Notice, Setting } from 'obsidian';
import { ExerciseTemplate } from '../types';
import WorkoutTrackerPlugin from '../plugin';
import {
	createActionBar,
	createButton,
	markPluginModal,
	renderHeader,
} from '../utils/uiKit';

export class ExerciseTemplateSettingModal extends Modal {
	plugin: WorkoutTrackerPlugin;
	template: ExerciseTemplate;
	onSave: () => void;

	constructor(app: App, plugin: WorkoutTrackerPlugin, onSave: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSave = onSave;
		this.template = {
			name: '',
			type: 'strength',
			muscleGroups: []
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		markPluginModal(contentEl);
		renderHeader(contentEl, {
			title: "Add exercise template",
			subtitle: "A reusable set table you can insert into any note",
		});

		new Setting(contentEl)
			.setName('Exercise name')
			.addText(text => text
				.setPlaceholder('Push-up')
				.onChange((value) => {
					this.template.name = value;
				}));

		new Setting(contentEl)
			.setName('Exercise type')
			.addDropdown(dropdown => dropdown
				.addOption('strength', 'Strength')
				.addOption('cardio', 'Cardio')
				.addOption('flexibility', 'Flexibility')
				.addOption('other', 'Other')
				.setValue(this.template.type)
				.onChange((value) => {
					this.template.type = value as 'strength' | 'cardio' | 'flexibility' | 'other';
				}));

		new Setting(contentEl)
			.setName('Default sets')
			.addText(text => text
				.setPlaceholder('3')
				.onChange((value) => {
					this.template.defaultSets = value ? parseInt(value) : undefined;
				}));

		new Setting(contentEl)
			.setName('Default reps')
			.addText(text => text
				.setPlaceholder('10')
				.onChange((value) => {
					this.template.defaultReps = value ? parseInt(value) : undefined;
				}));

		new Setting(contentEl)
			.setName(`Default weight (${this.plugin.settings.weightUnit})`)
			.addText(text => text
				.setPlaceholder('135')
				.onChange((value) => {
					this.template.defaultWeight = value ? parseFloat(value) : undefined;
				}));

		new Setting(contentEl)
			.setName('Muscle groups (comma-separated)')
			.addText(text => text
				.setPlaceholder('Example: chest, triceps, shoulders')
				.onChange((value) => {
					this.template.muscleGroups = value.split(',').map(s => s.trim()).filter(s => s);
				}));

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Save template')
				.setCta()
				.onClick(async () => {
					if (this.template.name && this.template.muscleGroups.length > 0) {
						this.plugin.settings.exerciseTemplates.push(this.template);
						await this.plugin.saveSettings();
						this.onSave();
						this.close();
					} else {
						new Notice('Please fill in name and muscle groups');
					}
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
