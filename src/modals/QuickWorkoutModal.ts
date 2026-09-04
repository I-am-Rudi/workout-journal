import { App, Modal } from 'obsidian';
import { Workout, Exercise, WorkoutTemplate } from '../types';
import WorkoutTrackerPlugin from '../plugin';
import {
	createButton,
	createEmptyState,
	createList,
	createRow,
	markPluginModal,
	renderHeader,
} from '../utils/uiKit';

export class QuickWorkoutModal extends Modal {
	plugin: WorkoutTrackerPlugin;

	constructor(app: App, plugin: WorkoutTrackerPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		markPluginModal(contentEl);
		renderHeader(contentEl, {
			title: "Quick workout log",
			subtitle: "Log a whole workout from one of your templates",
		});

		const templates = this.plugin.settings.workoutTemplates;
		if (!templates.length) {
			createEmptyState(contentEl, {
				title: "No workout templates yet",
				body: "Add one in the plugin settings to log it in a single tap.",
			});
			return;
		}

		const list = createList(contentEl);
		templates.forEach(template => {
			const { actions } = createRow(list, {
				title: template.name,
				meta: template.exercises.join(', ') || "No exercises",
				chips: [{ text: `~${template.estimatedDuration} min` }],
			});
			createButton(actions, {
				label: 'Log it',
				variant: 'secondary',
				onClick: () => {
					void this.createWorkoutFromTemplate(template);
				},
			});
		});
	}

	async createWorkoutFromTemplate(template: WorkoutTemplate) {
		const definitions = await this.plugin.definitionService.loadExerciseDefinitions();
		const definitionByName = new Map(definitions.map((definition) => [definition.name, definition]));
		const workout: Workout = {
			id: Date.now().toString(),
			date: new Date().toISOString().split('T')[0],
			name: template.name,
			exercises: template.exercises.map(exerciseName => {
				const exerciseTemplate = this.plugin.settings.exerciseTemplates.find(t => t.name === exerciseName);
				const definition = definitionByName.get(exerciseName);
				const exercise: Exercise = {
					name: exerciseName,
					sets: []
				};
				
				if (exerciseTemplate && exerciseTemplate.defaultSets) {
					const reps = definition?.lastPerformedReps ?? exerciseTemplate.defaultReps;
					const weight = definition?.lastPerformedWeight ?? exerciseTemplate.defaultWeight;
					for (let i = 0; i < exerciseTemplate.defaultSets; i++) {
						exercise.sets.push({
							reps,
							weight,
							duration: exerciseTemplate.defaultDuration
						});
					}
				}
				
				return exercise;
			}),
			duration: template.estimatedDuration
		};

		await this.plugin.createWorkoutFile(workout);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
