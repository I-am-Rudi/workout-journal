# Obsidian community post

Draft for the forum (Share & showcase) and/or r/ObsidianMD. Trim as needed —
the forum post can take the whole thing, Reddit probably wants the short version.

---

## Title

**Workout Journal — a full gym tracker in your vault, with 1,300+ exercises built in**

---

## Post

I have been building a workout tracking plugin for a while now, mostly because I
wanted to stop paying for a fitness app that keeps my training data somewhere I
cannot get at it. It started as a fork of
[Obsidian Workout Tracker](https://github.com/wanabeunique/obsidian-workout-tracker),
but it has grown enough that I am sharing it as its own thing.

The idea is simple: it should feel like a real fitness app while you are training,
and like plain markdown the rest of the time.

**While you are in the gym**, you start a routine and get a proper session view —
tick off sets, previous values already filled in from last time, a rest timer that
survives your screen locking, add or reorder exercises on the fly. It is built to
work on mobile, because that is where you actually use it. There is also a guided
circuit player for interval-style routines that counts you through each work and
pause window.

**Everywhere else**, it is just notes. One note per workout with a readable table,
your exercises and routines and plans as notes that link to each other, and a flat
CSV of every set you have ever done so you can throw the whole thing into a
spreadsheet whenever you feel like it.

**The bit I am most happy with in this release** is the exercise catalog. Building
an exercise library by hand is the most tedious part of starting a training log,
so the plugin now ships with 1,324 exercises — descriptions, target muscles,
equipment and a picture each. But it does not dump them in your vault. The catalog
lives inside the plugin, and an exercise only becomes a note when you actually pick
it: search while adding to a session and catalog results show up under your own
exercises, or browse and tick off a handful. Notes you made yourself are never
touched by it, and there is a command to attach a description to exercises you
already had.

If you are coming from Strong, there is a CSV importer that brings your whole
history over and fills in descriptions for the exercises it recognises.

Install with BRAT for now:
`https://github.com/I-am-Rudi/obsidian-workout-journal.git`

It is submitted to the community plugin directory and I will update here when it
is through.

Fair warning: it is mostly self-tested and was designed around my own vault, so
there are certainly rough edges. Bug reports and feedback very welcome.

<!-- PICTURES FOR THE POST
     The forum renders images inline and they do a lot of work here.
     1. The active session GIF — this is the one that makes people stop scrolling
     2. The Description tab on mobile, showing a picture + instructions
     3. The catalog browser with a filter applied
-->

---

## Short version (Reddit / Discord)

I built a workout tracker plugin for Obsidian. It gives you a proper fitness-app
session view while you train — set logging, rest timer, previous values pre-filled,
works on mobile — but everything it creates is plain markdown you own, plus a CSV of
every set for your own analysis.

New in this release: 1,324 exercises built into the plugin with descriptions and
pictures. It does not dump them into your vault — an exercise only becomes a note
when you pick it while adding it to a workout.

There is also a Strong CSV importer if you are migrating.

Available through BRAT, submitted to the community directory:
https://github.com/I-am-Rudi/obsidian-workout-journal

Mostly self-tested so far, so feedback is very welcome.
