# Obsidian Workout Journal Plugin

A comprehensive workout tracking plugin for Obsidian that helps you log exercises, track progress, and maintain your fitness routine within your notes.

## Features

- 🏋️ **Exercise Logging**: Track sets, reps, weights, duration, and distances
- 📝 **Workout Templates**: Create reusable workout templates for quick logging
- 📊 **Exercise Library**: Build your own exercise library with muscle group targeting
- 🎯 **Quick Actions**: Ribbon icon and command palette integration
- 📅 **Date Management**: Automatic date formatting and file organization
- 🔧 **Customizable**: Configurable folders, templates, and settings
- 📈 **Statistics & Analytics**: View comprehensive workout statistics and progress tracking
- ✏️ **Frontmatter Storage**: Workout data stored in YAML frontmatter for easy parsing and editing
- 🔄 **Edit Workouts**: Edit existing workouts with full frontmatter synchronization

## Installation

### Manual Installation (Development)

1. Clone or download this repository
2. Copy the plugin folder to your vault's `.obsidian/plugins/` directory
3. Install dependencies: `npm install`
4. Build the plugin: `npm run build`
5. Enable the plugin in Obsidian settings

### From Obsidian Community Plugins (Coming Soon)

This plugin will be available in the Obsidian Community Plugins directory once approved.

## Usage

### Creating a New Workout

1. Click the workout icon in the ribbon, or
2. Use the command palette: "Workout Journal: Create New Workout"
3. Fill in workout details and add exercises
4. Save to create a new workout file with frontmatter

### Quick Workout Logging

Use "Workout Journal: Quick Log Workout" to select from predefined workout templates for faster logging.

### Viewing Statistics

Use "Workout Journal: View Workout Statistics" to see comprehensive analytics about your workout progress.

### Editing Existing Workouts

1. Open any workout file created by the plugin
2. Use "Workout Journal: Edit Current Workout" command
3. Modify exercises, sets, or notes
4. Save to update the frontmatter automatically

### Exercise Templates

Insert exercise templates directly into your notes using "Workout Journal: Insert Exercise Template" command.

### Workout File Format

The plugin creates structured markdown files with YAML frontmatter for data storage and human-readable content below:

```markdown
---
id: "1672531200000"
date: "2025-06-26"
name: "Morning Run"
duration: 30
exercises:
  - name: "Running"
    sets:
      - duration: 30
        distance: 3
    notes: "Good pace, felt strong"
notes: "Beautiful morning for a run"
workoutTracker: true
---

# Morning Run

**Date:** 2025-06-26
**Duration:** 30 minutes

## Exercises

### Running

| Set | Reps | Weight | Duration | Distance | Rest |
| --- | ---- | ------ | -------- | -------- | ---- |
| 1   | -    | -      | 30       | 3        | -    |

**Notes:** Good pace, felt strong

## Notes

Beautiful morning for a run
```

### Statistics & Analytics

Access comprehensive workout statistics including:

- Total workouts, exercises, and sets
- Total volume (weight lifted)
- Exercise frequency analysis
- Personal records tracking
- Workout streaks
- Recent activity summaries

## Configuration

Access plugin settings through Settings → Community Plugins → Workout Journal:

- **Default Workout Folder**: Where workout files are saved
- **Exercise Templates**: Pre-configured exercises with defaults
- **Workout Templates**: Complete workout routines
- **Date Format**: Customize how dates appear in files

## Development

### Setup

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build
```

### Project Structure

- `main.ts` - Main plugin file with core functionality
- `manifest.json` - Plugin metadata
- `package.json` - Node.js dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `esbuild.config.mjs` - Build configuration

## Architecture

### Modular Service Design

The plugin uses a clean separation of concerns with two main services:

#### **WorkoutFileService**

- Handles all file operations (save, load, update workout files)
- Manages frontmatter parsing and generation
- Ensures data integrity with graceful error handling
- Supports multiple workouts per day with unique timestamps

#### **WorkoutStatisticsService**

- Calculates comprehensive workout statistics
- Tracks exercise frequency and personal records
- Computes workout streaks and progress metrics
- Provides time period analysis and progression tracking

This separation makes the codebase more maintainable, testable, and allows for easy extension of either file handling or statistical features.

## Features in Detail

### Exercise Types Supported

- **Strength Training**: Sets, reps, weight tracking
- **Cardio**: Duration and distance tracking
- **Flexibility**: Duration and notes
- **Custom**: Flexible format for any exercise type

### Data Organization

- Workouts saved in configurable folder structure
- Automatic file naming with date and workout name
- Structured markdown format for easy reading and editing
- Compatible with other Obsidian plugins (dataview, calendar, etc.)

## Contributing

## License

MIT License - see LICENSE file for details

## Support

If you find this plugin helpful, consider:

- ⭐ Starring the repository
- 🐛 Reporting bugs via GitHub issues
- 💡 Suggesting features

## Changelog

### 1.0.0

- Initial release
- Basic workout and exercise tracking
- Template system
- Settings configuration
- Ribbon and command palette integration
