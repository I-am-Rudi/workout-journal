# Exercise catalog integration plan

Status: **design agreed, not started**
Upstream: [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) — 1,324 exercises

## Goal

Let users pull exercises from a bundled catalog instead of hand-typing every one,
**without** dumping 1,324 notes into their exercise folder and without touching
anything they already created. Imported exercises carry a rendered description and
an image, both readable from inside an active session.

---

## Decisions taken

| Question | Decision |
|---|---|
| Ship the dataset or fetch it? | **Bundle** `exercises.json` (17.4 MB). Simpler, offline, no network disclosure for the text path. |
| Images bundled? | **No.** Link to them remotely. |
| Images downloadable? | Code written now, **not exposed** in settings yet. |
| Image modes | `none \| remote \| local` — only `none` and `remote` exposed initially. |
| Notes vs description | Both live in the note body under `## Description` / `## Notes`. Notes is always last. |
| Source of truth for notes | The `## Notes` body section, not `wj-notes` frontmatter. |
| Linking notes that already exist | Shared matcher + shared picker, reused by Strong import and a manual command. |
| Auto-attach policy | **Only on exact normalised match.** Fuzzy ranks the picker, never decides. |

## Licensing

Two licenses in one repo — the split drives the whole media design.

**Data (MIT).** Names, categories, body parts, equipment, targets, muscle groups
and all 10 instruction languages. Free to bundle, modify and ship commercially.
Single obligation: include the copyright notice and MIT permission text in the
distribution.

- [ ] Add `NOTICE.md` to this repo carrying the upstream MIT text and
      `Copyright (c) 2026 Hasan Emir Yıldırım`
- [ ] Reference it from the README

**Media (NOT MIT).** `images/` and `videos/` are © Gym visual, hosted upstream by
separate written permission. `NOTICE.md` upstream: *"cloning this repository does
not grant you any rights to the media."*

Consequence: the plugin **never copies media**. It writes a URL into the note and
the vault fetches it at render time — linking, not redistribution. A user who
later opts into offline storage is making a personal copy, which is their act, not
ours. Attribution (`© Gym visual — https://gymvisual.com/`) rides along in every
case; upstream requires it on every *use*, not just on copies.

- [ ] Courtesy heads-up to the upstream author that vaults will hotlink his repo
- [ ] Optional: ask Gym visual whether plugin-side offline caching is acceptable

### Hosting

Pin to an immutable commit, and prefer jsDelivr so the bandwidth is not billed to
someone else's repo (GitHub AUP reserves the right to throttle or delete repos
whose bandwidth is "significantly excessive"). raw.githubusercontent also sets
`cache-control: max-age=300`, so it re-fetches constantly.

```ts
// src/utils/catalogSource.ts
export const CATALOG_COMMIT = "TODO";  // git ls-remote https://github.com/hasaneyldrm/exercises-dataset main
export const MEDIA_BASE_URL =
  `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${CATALOG_COMMIT}`;
```

- [ ] Verify jsDelivr actually serves this repo before committing to it

Verified against the live host: images come back as `content-type: image/jpeg`
with `access-control-allow-origin: *`, so Obsidian renders a remote embed without
special handling. The linking posture rests on Svensson (C-466/12) and BestWater
(C-348/13) — linking to or framing content that is lawfully available is not a new
communication to the public — and the media *is* lawfully hosted upstream by
written permission.

---

## Phase 1 — Note anatomy

**Ships independently. No dataset involved. Fixes two live data-loss bugs.**

### Target note shape

```markdown
---
wj-type: exercise
wj-id: ds-0001
wj-media-id: "0025-Xa9fLm2"
wj-media-mode: remote
wj-media-attribution: "© Gym visual — https://gymvisual.com/"
---
# Barbell bench press

## Description

![](https://cdn.jsdelivr.net/gh/…/images/0025-Xa9fLm2.jpg)

Lie flat on a bench with your feet planted…

*© Gym visual — https://gymvisual.com/*

## Notes

Left shoulder twinges above 80kg. Elbows tucked 45°.
```

`## Notes` is always the last section. That single rule turns every write into a
string splice, so nothing above it can ever be damaged — including content the
user added by hand.

### 1.1 `src/utils/exerciseNoteSections.ts` (new)

```ts
export interface ExerciseNoteSections {
  prefix: string;       // frontmatter + "# Name"
  description: string;  // between "## Description" and "## Notes"
  notes: string;        // after "## Notes" → EOF
  hasDescription: boolean;
  hasNotes: boolean;
}

export function parseExerciseNote(content: string): ExerciseNoteSections;
export function writeNotesSection(content: string, notes: string): string;
export function writeDescriptionSection(content: string, description: string): string;
```

- Scan **line by line tracking fenced-code state**. Not one regex over the whole
  document — a user pasting a snippet containing `## Notes` must not split the note.
- Match `^#{2,}\s+Notes\s*$` case-insensitively so `### Notes` still works.
- No lookbehind (mobile / iOS < 16.4 rule).
- **No `## Notes` heading → the entire body is notes.** This is the back-compat
  story: every existing note parses correctly, zero migration needed, and the
  heading gets inserted the first time something writes.
- `writeDescriptionSection` inserts `## Description` right after the H1 when
  absent, pushing existing body content below a newly created `## Notes`.

### 1.2 Fix three destructive writes

Live today, currently harmless only because the body is just `# Name` + a copy of
`wj-notes`. Each one destroys the new sections.

**`DefinitionFileService.renderExerciseDefinition()` rebuilds the whole file.**
`createExerciseDefinition()` calls `vault.modify(existing, content)` on a full
re-render, so editing an exercise from settings wipes the entire body. Split it:
frontmatter through `FileManager.processFrontMatter()` (already mandated by
CLAUDE.md), body through the splice helpers. Full render only when creating a file
that does not yet exist.

**`ExerciseNoteModal.renderNote()` saves `prefix + textarea.value`,** where prefix
is only frontmatter + H1 — so saving a note deletes the Description above it. Bind
the textarea to `sections.notes`, save via `writeNotesSection`.

**`wj-notes` and the body have already drifted.** The session card reads
`def.notes` ← frontmatter, but the Note tab edits the body, so a note written
mid-session never appears on the card. Make `## Notes` the source of truth: in
`loadExerciseFromFile`, use the body section when the heading exists, fall back to
`wj-notes` when it does not. No extra I/O — `readFrontmatter()` already reads the
full file and throws the body away. Keep *writing* `wj-notes` for a version or two
for Dataview users, then drop it.

Also: `createExerciseDefinition()` derives the path from the sanitised name and
overwrites whatever sits there ("3/4 sit-up" → `34-sit-up.md`). Needs
create-if-absent with a collision suffix before any bulk import exists. It also
ignores `def.filePath` for exercises (unlike plans), so an edit after a rename
forks into a second note.

### 1.3 Description tab

`ExerciseNoteModal` gains a third tab: **Note | History | Description**.

```ts
import { Component, MarkdownRenderer } from "obsidian";

private renderComponent = new Component();
// onOpen():  this.renderComponent.load();
// onClose(): this.renderComponent.unload();

await MarkdownRenderer.render(
  this.app, sections.description, container, this.filePath, this.renderComponent
);
```

- `Modal` is not a `Component`, so the owned instance is required or embeds leak
  listeners.
- `sourcePath = this.filePath` is what resolves `![[media/…]]`.
- Rendering through Obsidian's pipeline satisfies the no-`innerHTML` rule for free
  — which matters, since this is the one place third-party text gets rendered.
- Empty state for hand-made exercises: "No description yet" + a button opening the
  catalog picker (Phase 2).
- Consider defaulting to Description when it exists and Notes is empty — for a
  freshly imported exercise that is the actual question being asked.

Add `description?: string` to `ExerciseDefinition` beside `notes`, and carry it
into the session via an `exerciseDescriptionMap`, mirroring `exerciseNotesMap` in
`plugin.ts:630`.

---

## Phase 2 — Catalog and import

### 2.1 Bundling

Ship `exercises.json` as bundled data. The full file is 17.4 MB; a projection to
`id, name, body_part, equipment, target, secondary_muscles` is 228 KB if load time
on mobile turns out to matter. Decide after measuring — do not pre-optimise.

### 2.2 Provenance — the non-interference guarantee

Every imported note is stamped:

```yaml
wj-source: exercises-dataset
wj-source-id: "0001"
```

**Nothing without those keys is ever touched by the importer.** That one rule buys
idempotent re-import, an additive-only "new exercises available" check later, and a
hard guarantee that hand-made notes are off limits.

Dedup in two passes at import:

1. Skip anything whose `wj-source-id` already exists.
2. Soft-match on normalised name against user-created exercises → prompt
   *"You already have **Bench press**. Skip / import as separate note / replace?"*
   Never auto-resolve.

The dataset contains 6 duplicate names and `createIdFromName` would collide on
them — give imported exercises ids like `ds-0001` instead.

### 2.3 Import UX — a picker, not a ceremony

Fold import into the existing picker rather than beside it. In
`AddSessionExerciseModal` and `ExerciseSettingsPage`, search renders three groups:

1. **Your exercises** — matches from the vault
2. **From catalog** — dimmed/secondary, with an import affordance
3. **Create new "<query>"**

Picking a catalog row writes the note and immediately uses it. Import becomes a
side effect of doing the thing you wanted, so the folder grows by exactly what gets
used — which is the entire point.

Plus a separate **Browse catalog** modal for deliberate stocking: filter by body
part (10 values), equipment (28), target (19), multi-select, "Import 12 exercises".
**No "import all" button.**

### 2.4 Field mapping

| Dataset | Note |
|---|---|
| `name` | `wj-name`, **title-cased** — see below |
| `target` + `secondary_muscles` | `wj-muscle-groups` |
| `equipment` | `wj-equipment` (new key, useful as a filter later) |
| `body_part === "cardio"` | type `cardio`, else `strength` |
| `instructions.en` | `## Description` body |
| `image` / `gif_url` | resolved via image mode → embed in `## Description` |

**Title casing.** Dataset names are entirely lowercase (`barbell bench press`),
which looks wrong as a note title and as a filename. Title-case on import:

- Capitalise each word; keep articles and short prepositions lowercase unless first
  (`dumbbell lunge with bicep curl` → `Dumbbell Lunge with Bicep Curl`)
- Capitalise after a hyphen (`chin-up` → `Chin-Up`)
- Acronym map for the ones a naive rule gets wrong: `ez` → `EZ`, `pov` → `POV`,
  `v-bar` → `V-Bar`, `bosu` → `BOSU`, `skierg` → `SkiErg`
- Strip the mojibake first (4.5) so `45в°` does not survive into a title

Applies **only to notes newly created from the catalog**. Names that came from
Strong, or that the user already typed, are never rewritten — see 4.2.

The dataset has no sets/reps and no notion of `reps-only` / `duration-only`, so
imported exercises cannot be circuit-eligible until the user says so. Show the type
dropdown in the import preview — it is the one field worth asking about, and the
one a bulk dump would get wrong 1,324 times.

---

## Phase 3 — Media

### 3.1 The mode

```ts
export type ExerciseImageMode = "none" | "remote" | "local";

export const EXERCISE_IMAGE_MODES: ExerciseImageMode[] = ["none", "remote", "local"];
export const EXPOSED_IMAGE_MODES:  ExerciseImageMode[] = ["none", "remote"]; // ← the flip
```

Settings stores `exerciseImageMode`, default `"remote"`. **Every code path handles
all three modes**; the only thing hiding `local` is what the settings dropdown
iterates. Adding `"local"` to `EXPOSED_IMAGE_MODES` is the entire change.

A hand-edited `"exerciseImageMode": "local"` in `data.json` must work. That keeps
the download path testable today, stops it rotting, and keeps esbuild from
tree-shaking it — it is reachable from a live switch, not dead code behind `false`.

### 3.2 The single seam

```ts
// src/utils/exerciseMediaService.ts
export interface ResolvedMedia {
  markdown: string;       // "" | "![](https://…)" | "![[media/xyz.jpg]]"
  attribution?: string;
  vaultPath?: string;     // local only
}

async resolveMedia(record: CatalogExercise, mode: ExerciseImageMode): Promise<ResolvedMedia>
```

- `none` → `{ markdown: "" }`
- `remote` → build the pinned URL, no I/O
- `local` → `ensureLocalCopy()`: check `vault.getFileByPath` first, else
  `requestUrl(...).arrayBuffer` → `vault.createBinary()` into
  `<exerciseLibraryFolder>/media/<media_id>.jpg`, return a wikilink

The importer calls `resolveMedia` and drops the string into the Description
section. It never knows which mode is active.

### 3.3 Retroactive conversion — build now, wire later

`wj-media-id` in frontmatter is what makes a later mode switch apply to notes that
already exist, with no catalog lookup and no dependence on the description text
surviving intact.

```ts
async convertNoteMedia(file: TFile, target: ExerciseImageMode): Promise<void>
```

Rewrites the embed **inside the Description section only**, via
`writeDescriptionSection`, and updates `wj-media-mode`. Back it with a
"Re-resolve exercise images" command, exposed when `local` is exposed.

Write this in Phase 3 while the section parser is fresh. Without it, everyone who
imported under `remote` is stranded there.

### 3.4 Sizes

| | Per exercise | All 1,324 | Typical 40-exercise library |
|---|---|---|---|
| Still (jpg) | ~6 KB | ~8 MB | ~240 KB |
| Animation (gif) | ~93 KB | ~123 MB | ~3.7 MB |

Offline download happens **at import**, never on startup and never lazily during an
active session — a network stall between sets is the worst possible moment.

### 3.5 Review requirements

- Network use must be disclosed in the README (Obsidian developer policies:
  "clearly explain which remote services are used and why they're needed")
- No fetch on plugin load; all network is user-initiated
- Use `requestUrl`, never `fetch` (CORS + mobile)

---

## Phase 4 — Linking exercises that already exist

Two entry points, one shared mechanism. Covers Strong-app imports and the long tail
of hand-made notes from before the catalog existed.

### 4.1 The matcher — bag of words

`src/utils/catalogMatcher.ts`

```ts
export interface CatalogMatch { record: CatalogExercise; confidence: "exact" | "subset" | "fuzzy"; score: number; }

export function findExact(name: string): CatalogExercise | null;   // auto-attach
export function rankCandidates(name: string, limit = 25): CatalogMatch[];  // picker only
```

**Normalisation → an unordered set of words.** Lowercase, split on every
non-alphanumeric character, drop empties, singularise (strip a trailing `s` when
the token is longer than 3 characters and does not end in `ss`), collect into a
`Set`. Two names match when their sets are **equal**.

```
"Bench Press (Barbell)"  → {bench, press, barbell}
"barbell bench press"    → {barbell, bench, press}     ✓ equal
"Chin Up"                → {chin, up}
"chin-up"                → {chin, up}                  ✓ equal
```

This is one rule that subsumes three: word order, punctuation/hyphenation, and the
`Name (Equipment)` → `equipment name` reordering. Prefer it over any special-casing.

**Measured against 25 representative Strong names:**

| Strategy | Hits | Ambiguous sets in dataset |
|---|---|---|
| Exact string, as written | 2 / 25 (8%) | — |
| **Word-set equality** | **9 / 25 (36%)** | 2 |
| Word-set equality + singularisation | **10 / 25 (40%)** | 3 |
| Plus unique-subset fallback | 12 / 25 (48%) | — |

**Ambiguity is a non-issue: 1,316 distinct word-sets across 1,324 exercises.** Of
the handful that collide, most are literal duplicates (`barbell seated calf raise`
twice) or punctuation variants (`dumbbell close grip press` /
`dumbbell close-grip press`). Set equality is effectively collision-free, which is
what makes auto-attach safe.

**Do not auto-attach on the subset fallback.** It is unique but semantically wrong
in exactly the cases it fires: `Overhead Press (Barbell)` ⊂ `barbell seated
overhead press` (seated ≠ standing) and `Skullcrusher (Barbell)` ⊂ `barbell reverse
grip skullcrusher` (reverse grip ≠ standard). Use it to pre-select the top row in
the picker, then let a human confirm.

The remaining ~60% miss on **vocabulary**, not word order, and no normalisation
rule reaches them: the dataset has no plain `barbell squat` (only `barbell full
squat`, `hack squat`, `jump squat`), no unqualified `leg press` (only `smith leg
press`, `sled 45° leg press`), and nothing named `face pull` or `hip thrust` at all.
Those belong to the picker in 4.3, not to a cleverer matcher.

**Fuzzy must never auto-attach.** Token-overlap + sequence scoring puts a plausible
candidate in the top 3 most of the time, but rarely the right one confidently —
`Squat (Barbell)` scores `barbell full squat`, `barbell hack squat` and `barbell
jump squat` identically at 0.74, none of which is a back squat. Fuzzy orders the
picker. A human presses enter.

### 4.2 Strong import enrichment

`deriveExerciseDefsFromWorkouts()` (`strongImportService.ts:229`) currently builds
every definition as `type: "other"` with empty muscle groups. Add an optional
enrichment pass, run before `createExerciseDefinition()` at line 395:

- `findExact(name)` hit → attach description, muscle groups, equipment, type, media
  and the `wj-source` / `wj-source-id` / `wj-media-id` stamps, exactly as a catalog
  import would
- No hit → import unchanged, as today

**Keep the Strong name. Never rename to the dataset name.** Workout notes and the
performance CSV reference exercises by name, and both
`PerformanceCsvService.getLatestSetsForExercise()` and the history tab in
`ExerciseNoteModal` match on `name.toLowerCase()`. Renaming `Bench Press (Barbell)`
to `Barbell bench press` silently orphans every logged set behind it — no prefill,
no history, no PRs. Record the link in frontmatter instead:

```yaml
wj-name: "Bench Press (Barbell)"      # the user's name, untouched
wj-source-id: "0025"
wj-catalog-name: "barbell bench press"  # cross-reference only
```

The same rule applies to the 4.3 command: attaching a description never touches
`wj-name`. Only a brand-new note created from the catalog gets the catalog's name.

Gate it behind a new checkbox in `StrongImportModal`, beside the existing
`importExerciseDefinitions` toggle: **"Fill in descriptions from the exercise
catalog"**. Report the outcome in the existing preview area — *"38 exercises, 14
matched to the catalog"* — so the miss rate is visible rather than mysterious.

Do **not** run fuzzy matching during import. The remaining 60-odd percent are
handled deliberately in 4.3, one at a time, by someone who knows which lift they
actually did.

### 4.3 Command: "Attach description from exercise catalog"

For migrating old notes, and the fallback for every Strong import that missed.

```ts
this.addCommand({
  id: "attach-catalog-description",
  name: "Attach description from exercise catalog",
  checkCallback: (checking) => {
    const file = this.app.workspace.getActiveFile();
    if (!file || !isExerciseNote(file)) return false;   // wj-type: exercise
    if (!checking) void this.openCatalogPicker(file);
    return true;
  },
});
```

`checkCallback` per the command rules in CLAUDE.md — it depends on the active note
being an exercise note, so it should vanish from the palette elsewhere.

The picker is an Obsidian **`FuzzySuggestModal<CatalogExercise>`**, seeded with the
current note's name so the likely candidate is already at the top and the user
usually just presses enter. Built-in fuzzy filtering handles 1,324 items fine;
`rankCandidates` supplies the initial ordering before the user types.

On select:

1. `resolveMedia(record, settings.exerciseImageMode)`
2. `writeDescriptionSection(content, description + media + attribution)` — touches
   **only** the Description section, so the user's `## Notes` are untouched
3. Stamp `wj-source-id`, `wj-media-id`, `wj-media-mode`, `wj-media-attribution`
4. Optionally offer to fill empty `wj-muscle-groups` / `wj-equipment` — never
   overwrite values the user already set

If the note already has a description, confirm before replacing.

### 4.4 Shared picker

The same `FuzzySuggestModal` backs the Phase 2 "From catalog" group, the browse
modal, and this command. One list, one ranking function, one selection handler that
takes a target (`new note` vs `existing file`). Build it once in Phase 2 and this
command is mostly wiring.

### 4.5 Data quality

Four dataset names carry mojibake — `sled 45в° calf press`, `sled 45в° leg press`,
`sled 45в° leg press (back pov)`, `sled 45в° leg wide press` (should be `45°`).
English instructions are clean. Sanitise names on import; it also stops `в°` from
polluting fuzzy scores.

## Suggested order

1. **Phase 1** — worth doing regardless of the dataset. As it stands, "edit
   exercise" in settings silently discards anything typed into an exercise note.
2. **Phase 2** — catalog + text import.
3. **Phase 3** — media, which by then is one URL string and one embed line.
4. **Phase 4** — linking existing exercises. Depends on the Phase 2 picker and the
   Phase 1 section writer; cheap once both exist.

## Open questions

- [ ] Commit SHA to pin (`git ls-remote`)
- [ ] Does jsDelivr serve this repo?
- [ ] Bundle the full 17.4 MB JSON or the 228 KB projection? Measure mobile load first.
- [ ] Heading names `## Description` / `## Notes` — constants, or settings-configurable?
- [ ] Confidence threshold for the "matched" count shown after Strong import
- [ ] Should Strong import offer a post-import review list of unmatched names, or
      leave them entirely to the manual command?
- [ ] Alternative media source if Gym visual objects:
      [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) is
      Unlicense (public domain), 800+ exercises, 2 images each, per-exercise JSON.
