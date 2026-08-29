# Workout Journal

A full workout tracker that lives inside your Obsidian vault. It aims to feel
like a dedicated fitness app while you are actually training — an interactive
session view, rest timers, previous values filled in for you — but every single
thing it creates is a plain markdown note that you own and can read, edit, query
and take with you.

The project originally started as a fork of the very nice [Obsidian Workout
Tracker](https://github.com/wanabeunique/obsidian-workout-tracker) plugin. The
feature set has grown enough since then that I wanted to share it as a separate
plugin.

So far the plugin is mostly self-tested and was specifically designed to be used
in my own vault. But I hope it can be useful to others as well, and I welcome any
feedback, bug reports, or contributions.

<p align="center">
  <img src="./assets/overview-first-look.gif" width="280" alt="A first look at Workout Journal: plans, routines and the exercise library">
</p>

## Why this and not a fitness app

- **Your data stays yours.** One markdown note per workout, plus a flat CSV of
  every set you have ever done. Nothing is locked in a proprietary database, and
  if you ever leave, you leave with everything.
- **It talks to the rest of your vault.** Exercises, routines and plans are all
  notes, so they link, they show up in graph view, and Dataview can query them.
- **It still feels like an app when it matters.** During a session you are not
  editing YAML — you are tapping through sets with a rest timer running.

## Features

### While you train

- 🏋️ **Active workout sessions** — a dedicated session view that mirrors a real
  fitness app: tick off sets, add sets or exercises on the fly, drag to reorder,
  jot notes without leaving the screen
- ⏱️ **Rest timer** that survives a locked screen, with optional sound and
  vibration feedback
- 🔁 **Previous values pre-filled** from your last performance, so you always know
  what you did last time
- ⭕ **Circuit routines** with a guided player that counts down each work and
  pause window and walks you through the rounds
- 📱 **Built for the gym** — the whole session flow is designed to work on mobile

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./assets/active-session.gif" width="280" alt="Working through a session: ticking off sets, rest timer, adding exercises">
      <br><sub><b>An active session</b> — sets, rest timer, notes</sub>
    </td>
    <td align="center" width="50%">
      <img src="./assets/circuit-training.gif" width="280" alt="The circuit player counting down work and pause windows across rounds">
      <br><sub><b>A circuit</b> — guided work and pause windows</sub>
    </td>
  </tr>
</table>

### Organising your training

- 📚 **Exercise library** with muscle groups, equipment, defaults and per-exercise
  notes
- 🧩 **Routines** you repeat, built from your exercises
- 🗓️ **Workout plans** that group routines into a structured week or block
- ✍️ **Editors for everything** — create and edit exercises, routines and plans
  through a proper UI instead of hand-writing frontmatter

### The exercise catalog

- 🔎 **1,324 exercises built in**, with descriptions and pictures, searchable by
  name, equipment and muscle
- 🎯 **Only what you actually use** — the catalog is not dumped into your vault.
  Pick an exercise while adding it to a session and the note is created right
  then, or browse and tick off a handful at a time
- 🤝 **It never touches what you already have.** Imported notes are stamped as
  coming from the catalog; your own exercises are invisible to the importer
- 🩹 **Retrofit old notes** with the "Attach description from the exercise
  catalog" command — search, press enter, and the description lands in the note
  without touching anything you wrote

### History and analysis

- 📊 **Statistics** — personal records, streaks, volume, exercise frequency and
  progression charts
- 🕒 **Every workout as its own note**, with a readable table underneath the
  frontmatter
- 🗂️ **A performance CSV** alongside the notes, for when you want to do your own
  analysis in a spreadsheet or a notebook
- 🔄 **Import from the Strong app** — bring your whole history across, and let the
  catalog fill in descriptions for the exercises it recognises

## Installation

### From the Obsidian community plugins (coming soon)

I will submit the plugin to the official Obsidian community plugins directory.
Once it is approved you will be able to install it directly from inside Obsidian.

### With BRAT (recommended for beta testing)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. Open BRAT settings and click **Add beta plugin**
3. Enter `https://github.com/I-am-Rudi/obsidian-workout-journal.git`
4. Choose a version (`latest`, or a specific release tag)
5. Click **Add plugin**, then enable **Workout Journal** under community plugins

### Manual installation (development)

1. Clone this repository
2. `npm install`
3. `npm run build`
4. Copy `main.js`, `manifest.json` and `styles.css` into
   `<your vault>/.obsidian/plugins/workout-journal/`
5. Enable the plugin in Obsidian settings

## Getting started

The fastest path from a fresh install to your first logged set:

1. Open settings and point the plugin at the folders you want it to use
2. Open the **exercise catalog** and import a handful of exercises you actually
   train — or skip this and add them as you go
3. Build a **routine** from those exercises
4. Tap the ribbon icon and start the routine

### Interfaces

- **Ribbon icon** — the landing page: resume a session, start an empty workout,
  or pick any routine, grouped under the plan it belongs to
- **Command palette** — everything the plugin can do, including starting a
  session from the note you have open
- **Settings** — manage your library, routines and plans, configure folders and
  units, and run imports

## The exercise catalog

Building an exercise library by hand is the most tedious part of starting a
workout log, so the plugin ships with one: 1,324 exercises with instructions,
target muscles, equipment and a picture each.

The important part is that **it does not clutter your vault**. The catalog lives
inside the plugin, not in your notes. Nothing becomes a note until you pick it.

There are three ways in:

- **While adding an exercise to a session** — search, and catalog results appear
  below your own exercises. Pick one and the note is created and used
  immediately.
- **Browse catalog** in settings — filter by body part and equipment, tick the
  ones you want, import them together.
- **"Attach description from the exercise catalog"** — run this on an exercise
  note you already have and pick the matching entry. Only the description is
  written; the name, your notes and anything else you set are left alone.

### How an exercise note is laid out

Everything the catalog adds goes under a `## Description` heading. Everything
under `## Notes` is yours — the plugin writes there only when you edit it
yourself, and never overwrites it.

```markdown
---
wj-type: exercise
wj-id: ds-0025
wj-name: Barbell Bench Press
wj-muscle-groups: [pectorals, triceps, deltoids]
wj-equipment: barbell
wj-source: exercises-dataset
wj-source-id: "0025"
---
# Barbell Bench Press

## Description

![](https://cdn.jsdelivr.net/gh/…/images/0025-Xa9fLm2.jpg)

Lie flat on a bench with your feet planted…

*© Gym visual — https://gymvisual.com/*

## Notes

Left shoulder twinges above 80 kg. Elbows tucked 45°.
```

During a session, tapping an exercise name opens that note in three tabs —
**Note**, **History** and **Description** — so you can check your form cues, see
what you lifted last month, and scribble something down without leaving the
workout.

### Pictures and network use

> [!note]
> The exercise **descriptions** are bundled with the plugin and work completely
> offline. The **pictures** are not: the note contains a link, and Obsidian loads
> it from a CDN when you look at it.

This is deliberate. The picture files are © Gym visual and are not covered by the
dataset's MIT licence, so the plugin links to them where they are already
published rather than copying them into your vault. If you would rather not load
anything from the network, set **Exercise images** to **No image** in settings and
the plugin will only ever write text.

## Importing from the Strong app

Strong can export your history as a CSV. In settings, point the importer at it
and the plugin will create one note per workout, preserving exercises, sets,
reps, weights and notes, and add everything to the performance CSV.

Optionally it also creates an exercise note for every unique exercise it finds,
and fills those in from the catalog where it recognises the name.

> [!tip]
> Running `Create routine from current workout` on a workout you imported from
> Strong is a quick way to turn your existing training into reusable routines.

> [!note]
> Strong writes exercise names like `Bench Press (Barbell)` where the catalog
> writes `barbell bench press`, so roughly a third of them are matched
> automatically. Your exercise names are always kept exactly as Strong wrote them
> — renaming them would disconnect them from your logged history. For the rest,
> open the exercise note and run **Attach description from the exercise catalog**.

## How your data is stored

Every note the plugin manages uses `wj-`-prefixed YAML frontmatter, with
`wj-type` marking what it is: `exercise`, `routine`, `plan` or `workout`.

```markdown
---
wj-type: workout
wj-id: "1672531200000"
wj-date: "2025-06-26"
wj-name: "Morning Run"
wj-duration: 30
wj-exercises:
  - name: "Running"
    sets:
      - duration: 30
        distance: 3
wj-notes: "Beautiful morning for a run"
---

# Morning Run

**Date:** 2025-06-26
**Duration:** 30 minutes

## Exercises

### Running

| Set | Reps | Weight | Duration | Distance | Rest |
| --- | ---- | ------ | -------- | -------- | ---- |
| 1   | -    | -      | 30       | 3        | -    |

## Notes

Beautiful morning for a run
```

Alongside the notes, every completed set is appended to a flat performance CSV.
That is what drives the previous-values pre-fill, and it means you can pull your
whole training history into a spreadsheet whenever you want.

## Configuration

Settings → Community plugins → Workout Journal:

- **Folders** for workouts, exercises, routines and plans
- **Units** — kg or lb, km or mi
- **Rest timer** default, plus sound and vibration feedback
- **Exercise images** — link to them, or turn them off entirely
- **Note templates** — extra frontmatter and body content merged into everything
  the plugin creates, so it fits your existing vault conventions
- **Library management** for exercises, routines and plans

<p align="center">
  <img src="./assets/settings.gif" width="280" alt="The settings tab: folders, units, rest timer, exercise images and library management">
</p>

## Development

```bash
npm install
npm run dev     # watch mode, no type-checking
npm run build   # type-check + production bundle
```

The bundled exercise catalog is generated, not hand-written. To regenerate it
from a fresh copy of the upstream dataset:

```bash
node scripts/build-catalog.mjs path/to/exercises.json
```

That writes `src/data/catalogIndex.ts` (the search index) and
`src/data/catalogDescriptions.ts` (the instruction texts). Both are bundled into
`main.js`, because Obsidian only downloads `main.js`, `manifest.json` and
`styles.css` when installing a plugin.

## Credits and licence

The plugin is MIT licensed — see [LICENSE](./LICENSE).

The exercise catalog comes from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset).
The data is MIT licensed; the exercise images are © Gym visual and are used by
linking only. See [NOTICE.md](./NOTICE.md) for the full attribution.

Originally forked from
[obsidian-workout-tracker](https://github.com/wanabeunique/obsidian-workout-tracker).
