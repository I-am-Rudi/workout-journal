import { Workout } from "../types";

export interface WorkoutStatistics {
  totalWorkouts: number;
  totalExercises: number;
  totalSets: number;
  totalVolume: number; // total weight lifted
  averageWorkoutDuration: number;
  exerciseFrequency: Record<string, number>;
  workoutsByDate: Record<string, Workout[]>;
  personalRecords: Record<
    string,
    { weight: number; reps: number; date: string }
  >;
  workoutStreak: number;
  lastWorkoutDate: string;
}

export class WorkoutStatisticsService {
  /**
   * Calculate comprehensive workout statistics from an array of workouts
   */
  calculateStatistics(workouts: Workout[]): WorkoutStatistics {
    const stats: WorkoutStatistics = {
      totalWorkouts: workouts.length,
      totalExercises: 0,
      totalSets: 0,
      totalVolume: 0,
      averageWorkoutDuration: 0,
      exerciseFrequency: {},
      workoutsByDate: {},
      personalRecords: {},
      workoutStreak: 0,
      lastWorkoutDate: "",
    };

    if (workouts.length === 0) {
      return stats;
    }

    // Sort workouts by date
    const sortedWorkouts = workouts.sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    stats.lastWorkoutDate = sortedWorkouts[sortedWorkouts.length - 1].date;

    let totalDuration = 0;
    let durationCount = 0;

    workouts.forEach((workout) => {
      // Count exercises and sets
      stats.totalExercises += workout.exercises.length;

      // Group workouts by date
      if (!stats.workoutsByDate[workout.date]) {
        stats.workoutsByDate[workout.date] = [];
      }
      stats.workoutsByDate[workout.date].push(workout);

      // Duration
      if (workout.duration) {
        totalDuration += workout.duration;
        durationCount++;
      }

      workout.exercises.forEach((exercise) => {
        // Exercise frequency
        stats.exerciseFrequency[exercise.name] =
          (stats.exerciseFrequency[exercise.name] || 0) + 1;

        stats.totalSets += exercise.sets.length;

        exercise.sets.forEach((set) => {
          // Total volume (weight × reps)
          if (set.weight && set.reps) {
            stats.totalVolume += set.weight * set.reps;
          }

          // Personal records — only count default sets (not warmup/dropset/myoreps)
          const isWorkingSet = !set.setType || set.setType === "default";
          if (isWorkingSet && set.weight && set.reps) {
            const currentPR = stats.personalRecords[exercise.name];
            if (
              !currentPR ||
              set.weight > currentPR.weight ||
              (set.weight === currentPR.weight && set.reps > currentPR.reps)
            ) {
              stats.personalRecords[exercise.name] = {
                weight: set.weight,
                reps: set.reps,
                date: workout.date,
              };
            }
          }
        });
      });
    });

    // Calculate average duration
    if (durationCount > 0) {
      stats.averageWorkoutDuration = totalDuration / durationCount;
    }

    // Calculate workout streak
    stats.workoutStreak = this.calculateWorkoutStreak(sortedWorkouts);

    return stats;
  }

  /**
   * Calculate current workout streak
   */
  private calculateWorkoutStreak(sortedWorkouts: Workout[]): number {
    if (sortedWorkouts.length === 0) return 0;

    const today = new Date();
    const uniqueDates = [...new Set(sortedWorkouts.map((w) => w.date))].sort();

    let streak = 0;
    let currentDate = new Date(today);

    // Check backwards from today
    for (let i = uniqueDates.length - 1; i >= 0; i--) {
      const workoutDate = new Date(uniqueDates[i]);
      const diffDays = Math.floor(
        (currentDate.getTime() - workoutDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays <= 1) {
        // Allow for today or yesterday
        streak++;
        currentDate = workoutDate;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Get top N most frequent exercises
   */
  getTopExercises(
    workouts: Workout[],
    limit: number = 10
  ): Array<{ exercise: string; count: number }> {
    const stats = this.calculateStatistics(workouts);
    return Object.entries(stats.exerciseFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([exercise, count]) => ({ exercise, count }));
  }

  /**
   * Get workouts within a date range
   */
  getWorkoutsInDateRange(
    workouts: Workout[],
    startDate: string,
    endDate: string
  ): Workout[] {
    return workouts.filter(
      (workout) => workout.date >= startDate && workout.date <= endDate
    );
  }

  /**
   * Get workout statistics for a specific time period
   */
  getStatisticsForPeriod(
    workouts: Workout[],
    startDate: string,
    endDate: string
  ): WorkoutStatistics {
    const periodWorkouts = this.getWorkoutsInDateRange(
      workouts,
      startDate,
      endDate
    );
    return this.calculateStatistics(periodWorkouts);
  }

  /**
   * Calculate monthly workout counts
   */
  getMonthlyWorkoutCounts(workouts: Workout[]): Record<string, number> {
    const monthlyCounts: Record<string, number> = {};

    workouts.forEach((workout) => {
      const monthKey = workout.date.substring(0, 7); // YYYY-MM format
      monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
    });

    return monthlyCounts;
  }

  /**
   * Get progression data for a specific exercise
   */
  getExerciseProgression(
    workouts: Workout[],
    exerciseName: string
  ): Array<{ date: string; maxWeight: number; totalVolume: number }> {
    const progression: Array<{
      date: string;
      maxWeight: number;
      totalVolume: number;
    }> = [];

    workouts
      .filter((workout) =>
        workout.exercises.some((ex) => ex.name === exerciseName)
      )
      .forEach((workout) => {
        const exercise = workout.exercises.find(
          (ex) => ex.name === exerciseName
        );
        if (exercise) {
          let maxWeight = 0;
          let totalVolume = 0;

          exercise.sets.forEach((set) => {
            if (set.weight) {
              maxWeight = Math.max(maxWeight, set.weight);
              if (set.reps) {
                totalVolume += set.weight * set.reps;
              }
            }
          });

          if (maxWeight > 0) {
            progression.push({
              date: workout.date,
              maxWeight,
              totalVolume,
            });
          }
        }
      });

    return progression.sort((a, b) => a.date.localeCompare(b.date));
  }
}
