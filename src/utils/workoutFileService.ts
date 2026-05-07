import { App, normalizePath, TFile, Notice } from "obsidian";
import { Workout, Exercise, ExerciseSet, WorkoutTrackerSettings } from "../types";
import { parseYaml, stringifyYaml } from "obsidian";
import { parseTemplateFrontmatter, appendTemplateBody } from "./noteTemplateUtils";

export class WorkoutFileService {
  app: App;
  workoutFolder: string;
  private settings: WorkoutTrackerSettings | null = null;

  constructor(app: App, workoutFolder: string, settings?: WorkoutTrackerSettings) {
    this.app = app;
    this.workoutFolder = this.normalizeUserPath(workoutFolder);
    if (settings) this.settings = settings;
  }

  setSettings(settings: WorkoutTrackerSettings) {
    this.settings = settings;
    this.workoutFolder = this.normalizeUserPath(settings.defaultWorkoutFolder);
  }

  /**
   * Save workout data to a markdown file with frontmatter
   */
  async saveWorkout(workout: Workout): Promise<TFile | null> {
    try {
      const fileName = this.generateFileName(workout);
      const filePath = `${this.workoutFolder}/${fileName}`;

      // Ensure the folder exists
      if (!this.app.vault.getAbstractFileByPath(this.workoutFolder)) {
        await this.app.vault.createFolder(this.workoutFolder);
      }

      const content = this.generateWorkoutFileContent(workout);

      // Check if file already exists
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile instanceof TFile) {
        // Update existing file
        await this.app.vault.modify(existingFile, content);
        new Notice(`Workout updated: ${fileName}`);
        return existingFile;
      } else {
        // Create new file
        const newFile = await this.app.vault.create(filePath, content);
        new Notice(`Workout saved: ${fileName}`);
        return newFile;
      }
    } catch (error) {
      new Notice(`Error saving workout: ${error.message}`);
      return null;
    }
  }

  /**
   * Load a workout from a file with frontmatter
   */
  async loadWorkout(file: TFile): Promise<Workout | null> {
    try {
      const content = await this.app.vault.read(file);
      return this.parseWorkoutFromContent(content, file.basename);
    } catch (error) {
      console.error(`Error loading workout from ${file.path}:`, error);
      return null;
    }
  }

  /**
   * Update an existing workout file
   */
  async updateWorkout(file: TFile, workout: Workout): Promise<boolean> {
    try {
      const content = this.generateWorkoutFileContent(workout);
      await this.app.vault.modify(file, content);
      new Notice(`Workout updated: ${file.basename}`);
      return true;
    } catch (error) {
      new Notice(`Error updating workout: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all workout files from the workout folder
   */
  getAllWorkoutFiles(): TFile[] {
    const folder = this.app.vault.getAbstractFileByPath(this.workoutFolder);

    if (!folder) {
      return [];
    }
    const files = this.app.vault
      .getMarkdownFiles()
      .filter(
        (file) =>
          file.path.startsWith(this.workoutFolder + "/") &&
          file.extension === "md"
      );

    return files;
  }

  /**
   * Load all workouts from the workout folder
   */
  async loadAllWorkouts(): Promise<Workout[]> {
    const workoutFiles = this.getAllWorkoutFiles();
    const workouts: Workout[] = [];

    for (const file of workoutFiles) {
      const workout = await this.loadWorkout(file);
      if (workout) {
        workouts.push(workout);
      }
    }

    return workouts;
  }

  /**
   * Check if a file is a workout file by checking for wj-type === "workout" in frontmatter.
   * Routine and plan notes use different wj-type values, so we must use the type discriminator
   * to avoid mistakenly re-processing them as workout logs.
   */
  async isWorkoutFile(file: TFile): Promise<boolean> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) return false;

      const frontmatter = parseYaml(frontmatterMatch[1]);
      return frontmatter?.['wj-type'] === "workout";
    } catch {
      return false;
    }
  }
  /**
   * Sync frontmatter with workout file content when file is modified
   * This ensures frontmatter stays up-to-date if the file is manually edited
   */
  async syncFrontmatterWithContent(file: TFile): Promise<boolean> {
    try {
      const originalContent = await this.app.vault.read(file);
      await this.app.vault.process(file, (content) => {
        // Try to parse the workout data from markdown body first (since that's what users edit)
        let workout = this.parseWorkoutFromMarkdownBody(content, file.basename);

        // If markdown body parsing fails, fall back to frontmatter parsing
        if (!workout) {
          workout = this.parseWorkoutFromContent(content, file.basename);
          if (!workout) {
            return content;
          }
        }

        // Always regenerate the file with updated frontmatter based on the parsed content
        const expectedContent = this.generateWorkoutFileContent(workout);
        if (content === expectedContent) {
          return content;
        }
        return expectedContent;
      });
      const updatedContent = await this.app.vault.read(file);
      return updatedContent !== originalContent;
    } catch (error) {
      console.error(`Error syncing frontmatter for ${file.path}:`, error);
      return false;
    }
  }

  /**
   * Return the vault path that saveWorkout would use for this workout,
   * without actually writing anything.  Used for duplicate detection.
   */
  getWorkoutFilePath(workout: Workout): string {
    return `${this.workoutFolder}/${this.generateFileName(workout)}`;
  }

  /**
   * Same as saveWorkout but suppresses per-file Notice messages.
   * Intended for bulk import flows where a single summary notice is preferred.
   */
  async saveWorkoutSilently(workout: Workout): Promise<TFile | null> {
    const fileName = this.generateFileName(workout);
    const filePath = `${this.workoutFolder}/${fileName}`;

    if (!this.app.vault.getAbstractFileByPath(this.workoutFolder)) {
      await this.app.vault.createFolder(this.workoutFolder);
    }

    const content = this.generateWorkoutFileContent(workout);
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
      return existingFile;
    }
    return this.app.vault.create(filePath, content);
  }

  /**
   * Generate filename for workout
   */
  private generateFileName(workout: Workout): string {
    const timestamp = workout.id || Date.now().toString();
    const safeName = workout.name
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "-");
    return `${workout.date}-${timestamp}-${safeName}.md`;
  }

  /**
   * Generate markdown content with frontmatter
   */
  private generateWorkoutFileContent(workout: Workout): string {
    const baseFrontmatter = {
      'wj-id': workout.id,
      'wj-date': workout.date,
      'wj-name': workout.name,
      'wj-duration': workout.duration,
      'wj-exercises': workout.exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.sets,
        notes: exercise.notes,
      })),
      'wj-notes': workout.notes,
      'wj-source-routine-id': workout.sourceRoutineId,
      'wj-source-plan-id': workout.sourcePlanId,
      'wj-type': "workout",
    };

    const templateFm = parseTemplateFrontmatter(
      this.settings?.noteTemplates?.workout?.frontmatter
    );
    const frontmatter = { ...templateFm, ...baseFrontmatter };

    let content = "---\n";
    content += stringifyYaml(frontmatter);
    content += "---\n\n";

    // Add readable content below frontmatter
    content += `# ${workout.name}\n\n`;
    content += `**Date:** ${workout.date}\n`;
    if (workout.duration) {
      content += `**Duration:** ${workout.duration} minutes\n`;
    }
    content += `\n## Exercises\n\n`;

    workout.exercises.forEach((exercise) => {
      content += `### ${exercise.name}\n\n`;
      if (exercise.sets && exercise.sets.length > 0) {
        content += `| Set | Type | Reps | Weight | Duration | Distance | Rest |\n`;
        content += `|-----|------|------|--------|----------|----------|------|\n`;
        exercise.sets.forEach((set, index) => {
          const typeLabel = (set.setType && set.setType !== "default")
            ? set.setType[0].toUpperCase()
            : "default";
          content += `| ${index + 1} | ${typeLabel} | ${set.reps || "-"} | ${
            set.weight || "-"
          } | ${set.duration || "-"} | ${set.distance || "-"} | ${
            set.restTime || "-"
          } |\n`;
        });
      }
      if (exercise.notes) {
        content += `\n**Notes:** ${exercise.notes}\n`;
      }
      content += `\n`;
    });

    if (workout.notes) {
      content += `## Notes\n\n${workout.notes}\n`;
    }

    return appendTemplateBody(content, this.settings?.noteTemplates?.workout?.body);
  }

  /**
   * Parse workout data from file content
   */
  parseWorkoutFromContent(
    content: string,
    fallbackName: string
  ): Workout | null {
    try {
      // Extract frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        console.debug(`No frontmatter found in workout file: ${fallbackName}`);
        return null;
      }

      const yamlContent = frontmatterMatch[1];
      const frontmatter = parseYaml(yamlContent);

      // Validate and construct workout object
      if (!frontmatter || frontmatter['wj-type'] !== "workout") {
        console.debug(`Invalid workout frontmatter in file: ${fallbackName}`);
        return null;
      }

      const workout: Workout = {
        id: frontmatter['wj-id'] || Date.now().toString(),
        date: frontmatter['wj-date'] || new Date().toISOString().split("T")[0],
        name: frontmatter['wj-name'] || fallbackName,
        exercises: this.parseExercises(frontmatter['wj-exercises'] || []),
        duration: frontmatter['wj-duration'],
        notes: frontmatter['wj-notes'],
        sourceRoutineId: frontmatter['wj-source-routine-id'],
        sourcePlanId: frontmatter['wj-source-plan-id'],
      };

      return workout;
    } catch (error) {
      console.error(`Error parsing workout content:`, error);
      return null;
    }
  }

  /**
   * Parse workout data from markdown body content (fallback if frontmatter is missing)
   * This allows syncing when users edit the readable content directly
   */
  parseWorkoutFromMarkdownBody(
    content: string,
    fileName: string
  ): Workout | null {
    try {
      // Try to preserve the original ID from frontmatter if it exists
      let originalId: string | undefined;
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        try {
          const frontmatter = parseYaml(frontmatterMatch[1]);
          originalId = frontmatter?.['wj-id'];
        } catch {
          // Ignore frontmatter parsing errors, we'll generate a new ID
        }
      }

      // Remove frontmatter section if it exists
      const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n\n/, "");

      // Extract workout name from h1 header
      const nameMatch = bodyContent.match(/^# (.+)$/m);
      const name = nameMatch ? nameMatch[1] : fileName;

      // Extract date
      const dateMatch = bodyContent.match(/\*\*Date:\*\* (.+)$/m);
      const date = dateMatch
        ? dateMatch[1]
        : new Date().toISOString().split("T")[0];

      // Extract duration
      const durationMatch = bodyContent.match(
        /\*\*Duration:\*\* (\d+) minutes$/m
      );
      const duration = durationMatch ? parseInt(durationMatch[1]) : undefined;

      // Extract exercises
      const exercises = this.parseExercisesFromMarkdown(bodyContent);

      // Extract notes
      const notesMatch = bodyContent.match(/## Notes\n\n(.+)$/s);
      const notes = notesMatch ? notesMatch[1].trim() : undefined;

      return {
        id: originalId || Date.now().toString(), // Preserve original ID or generate new one
        date,
        name,
        exercises,
        duration,
        notes,
      };
    } catch (error) {
      console.error("Error parsing workout from markdown body:", error);
      return null;
    }
  }

  /**
   * Parse exercises from markdown content
   */
  private parseExercisesFromMarkdown(content: string): Exercise[] {
    const exercises: Exercise[] = [];

    // Find all exercise sections (h3 headers)
    const exerciseMatches = content.matchAll(
      /### (.+)\n\n([\s\S]*?)(?=\n### |\n## |$)/g
    );

    for (const match of exerciseMatches) {
      const exerciseName = match[1];
      const exerciseContent = match[2];

      // Parse exercise sets from table
      const sets = this.parseSetsFromTable(exerciseContent);

      // Parse exercise notes
      const notesMatch = exerciseContent.match(/\*\*Notes:\*\* (.+)$/m);
      const notes = notesMatch ? notesMatch[1] : undefined;

      exercises.push({
        name: exerciseName,
        sets,
        notes,
      });
    }

    return exercises;
  }

  /**
   * Parse sets from markdown table
   */
  private parseSetsFromTable(content: string): ExerciseSet[] {
    const sets: ExerciseSet[] = [];

    // Find table rows (skip header and separator)
    const tableRows = content
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.includes("--"))
      .slice(1); // Skip header row

    for (const row of tableRows) {
      const cells = row
        .split("|")
        .map((cell) => cell.trim())
        .slice(1, -1); // Remove empty first/last

      // Detect 7-column format (Set | Type | Reps | Weight | Duration | Distance | Rest)
      // vs 6-column legacy format (Set | Reps | Weight | Duration | Distance | Rest)
      const hasTypeColumn = cells.length >= 7;

      if (hasTypeColumn) {
        const set: ExerciseSet = {};
        const rawType = cells[1];
        if (rawType && rawType !== "-" && rawType !== "default") {
          const typeMap: Record<string, import("../types").SetType> = {
            W: "warmup",
            D: "dropset",
            M: "myoreps",
            warmup: "warmup",
            dropset: "dropset",
            myoreps: "myoreps",
          };
          set.setType = typeMap[rawType];
        }
        if (cells[2] && cells[2] !== "-") set.reps = parseInt(cells[2]);
        if (cells[3] && cells[3] !== "-") set.weight = parseFloat(cells[3]);
        if (cells[4] && cells[4] !== "-") set.duration = parseInt(cells[4]);
        if (cells[5] && cells[5] !== "-") set.distance = parseFloat(cells[5]);
        if (cells[6] && cells[6] !== "-") set.restTime = parseInt(cells[6]);
        sets.push(set);
      } else if (cells.length >= 6) {
        const set: ExerciseSet = {};
        // Parse each column (Set | Reps | Weight | Duration | Distance | Rest)
        if (cells[1] && cells[1] !== "-") set.reps = parseInt(cells[1]);
        if (cells[2] && cells[2] !== "-") set.weight = parseFloat(cells[2]);
        if (cells[3] && cells[3] !== "-") set.duration = parseInt(cells[3]);
        if (cells[4] && cells[4] !== "-") set.distance = parseFloat(cells[4]);
        if (cells[5] && cells[5] !== "-") set.restTime = parseInt(cells[5]);
        sets.push(set);
      }
    }

    return sets;
  }

  /**
   * Parse exercises from frontmatter
   */
  private parseExercises(exercisesData: unknown): Exercise[] {
    if (!Array.isArray(exercisesData)) {
      return [];
    }

    return exercisesData.map((exerciseData) => {
      const parsed =
        exerciseData && typeof exerciseData === "object"
          ? (exerciseData as Record<string, unknown>)
          : {};
      return {
        name: typeof parsed.name === "string" ? parsed.name : "Unknown Exercise",
        sets: Array.isArray(parsed.sets) ? (parsed.sets as ExerciseSet[]) : [],
        notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
      };
    });
  }

  private normalizeUserPath(path: string): string {
    const trimmed = path.trim();
    return trimmed ? normalizePath(trimmed) : "";
  }
}
