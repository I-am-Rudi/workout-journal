/**
 * Exercise notes are split into three parts:
 *
 *   ---frontmatter---
 *   # Name                  <- prefix
 *   ## Description          <- plugin-managed: catalog text + media
 *   ## Notes                <- the user's own scratch space, always last
 *
 * `## Notes` being the final section is what keeps writes safe: every update is
 * a splice on the original string, so nothing above the edited section can be
 * damaged. Notes written before this layout existed have no headings at all —
 * those parse as "the whole body is notes", so no migration is needed.
 */

export const DESCRIPTION_HEADING = "Description";
export const NOTES_HEADING = "Notes";

export interface ExerciseNoteSections {
  /** Frontmatter plus the `# Title` line, reproduced verbatim on write. */
  prefix: string;
  /** Body between the H1 and `## Description` (only present in odd hand-edits). */
  intro: string;
  description: string;
  notes: string;
  hasDescription: boolean;
  hasNotes: boolean;
}

interface HeadingHit {
  /** Index of the first character of the heading line. */
  start: number;
  /** Index just past the heading line's trailing newline. */
  end: number;
}

/**
 * Locates a `## <name>` heading outside of fenced code blocks.
 *
 * Scanning line by line rather than matching a regex against the whole document
 * matters: a user pasting a markdown snippet that contains `## Notes` inside a
 * fence must not have their note split at that point.
 */
function findHeading(content: string, name: string): HeadingHit | null {
  const target = name.toLowerCase();
  let offset = 0;
  let inFence = false;
  let fenceMarker = "";

  for (const line of content.split("\n")) {
    const lineEnd = offset + line.length + 1;
    const trimmed = line.trim();

    // Track ``` and ~~~ fences; a fence closes only on its own marker type.
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }
      offset = lineEnd;
      continue;
    }

    if (!inFence) {
      // Accept ## through ###### so a user who prefers ### keeps working.
      const headingMatch = trimmed.match(/^(#{2,6})\s+(.+?)\s*$/);
      if (headingMatch && headingMatch[2].toLowerCase() === target) {
        return { start: offset, end: Math.min(lineEnd, content.length) };
      }
    }

    offset = lineEnd;
  }

  return null;
}

/** Splits frontmatter + `# Title` off the front of a note. */
function splitPrefix(content: string): { prefix: string; body: string } {
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  const afterFm = fmMatch ? content.slice(fmMatch[0].length) : content;
  const fm = fmMatch ? fmMatch[0] : "";

  const titleMatch = afterFm.match(/^\n*# [^\n]*\n?/);
  if (!titleMatch) {
    return { prefix: fm, body: afterFm };
  }
  return { prefix: fm + titleMatch[0], body: afterFm.slice(titleMatch[0].length) };
}

export function parseExerciseNote(content: string): ExerciseNoteSections {
  const { prefix, body } = splitPrefix(content);

  const descHit = findHeading(body, DESCRIPTION_HEADING);
  const notesHit = findHeading(body, NOTES_HEADING);

  // Legacy layout: no headings at all, so the entire body is the user's notes.
  if (!descHit && !notesHit) {
    return {
      prefix,
      intro: "",
      description: "",
      notes: body.trim(),
      hasDescription: false,
      hasNotes: false,
    };
  }

  const intro = body.slice(0, Math.min(descHit?.start ?? body.length, notesHit?.start ?? body.length));

  let description = "";
  if (descHit) {
    const descEnd = notesHit && notesHit.start > descHit.end ? notesHit.start : body.length;
    description = body.slice(descHit.end, descEnd).trim();
  }

  const notes = notesHit ? body.slice(notesHit.end).trim() : "";

  return {
    prefix,
    intro: intro.trim(),
    description,
    notes,
    hasDescription: Boolean(descHit),
    hasNotes: Boolean(notesHit),
  };
}

/**
 * Replaces the `## Notes` section, leaving everything above it byte-identical.
 * Creates the heading when the note predates this layout.
 */
export function writeNotesSection(content: string, notes: string): string {
  const { prefix, body } = splitPrefix(content);
  const notesHit = findHeading(body, NOTES_HEADING);
  const trimmed = notes.trim();

  if (notesHit) {
    const head = body.slice(0, notesHit.end);
    return `${prefix}${head}\n${trimmed}\n`;
  }

  // No heading yet. Anything already in the body is the user's old free-form
  // note, so it moves under the new heading rather than being displaced by it.
  const existing = body.trim();
  const merged = existing && existing !== trimmed ? `${existing}\n\n${trimmed}` : trimmed;
  return `${prefix}\n## ${NOTES_HEADING}\n\n${merged}\n`;
}

/**
 * Replaces the `## Description` section without touching the user's notes.
 * Inserts the heading directly after the title when absent, pushing any
 * pre-existing body content below a newly created `## Notes`.
 */
export function writeDescriptionSection(content: string, description: string): string {
  const { prefix, body } = splitPrefix(content);
  const trimmed = description.trim();
  const descHit = findHeading(body, DESCRIPTION_HEADING);
  const notesHit = findHeading(body, NOTES_HEADING);

  if (descHit) {
    const head = body.slice(0, descHit.end);
    const tail = notesHit && notesHit.start > descHit.end ? body.slice(notesHit.start) : "";
    return `${prefix}${head}\n${trimmed}\n\n${tail}`.replace(/\n{3,}$/, "\n");
  }

  const descBlock = `\n## ${DESCRIPTION_HEADING}\n\n${trimmed}\n`;

  if (notesHit) {
    return `${prefix}${descBlock}\n${body.slice(notesHit.start)}`;
  }

  const existing = body.trim();
  const notesBlock = `\n## ${NOTES_HEADING}\n\n${existing}${existing ? "\n" : ""}`;
  return `${prefix}${descBlock}${notesBlock}`;
}

/** Convenience for building a fresh note body from both sections. */
export function renderExerciseBody(description: string, notes: string): string {
  const desc = description.trim();
  const note = notes.trim();
  const descBlock = desc ? `\n## ${DESCRIPTION_HEADING}\n\n${desc}\n` : "";
  return `${descBlock}\n## ${NOTES_HEADING}\n\n${note}${note ? "\n" : ""}`;
}
