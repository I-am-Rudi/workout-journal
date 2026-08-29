/**
 * Catalog names arrive entirely lowercase ("barbell bench press"), which reads
 * badly as a note title and as a filename.
 *
 * Only applied to notes newly created from the catalog. Names that came from a
 * Strong import, or that the user typed themselves, are never rewritten —
 * workout notes and the performance CSV reference exercises by name, so
 * renaming one silently orphans its logged history.
 */

/** Left lowercase unless they open the name. */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
  "nor", "of", "off", "on", "onto", "or", "over", "per", "the", "to", "up",
  "v", "vs", "with", "without",
]);

/** Cases a per-word capitalisation rule gets wrong. */
const SPECIAL_CASES: Record<string, string> = {
  ez: "EZ",
  pov: "POV",
  bosu: "BOSU",
  skierg: "SkiErg",
  vbar: "V-Bar",
  iii: "III",
  ii: "II",
  iv: "IV",
};

function capitalise(word: string): string {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1);
}

/** Applies casing across hyphenated compounds: "chin-up" -> "Chin-Up". */
function caseWord(word: string, isFirst: boolean): string {
  const lower = word.toLowerCase();

  const special = SPECIAL_CASES[lower.replace(/[^a-z0-9]/g, "")];
  if (special && lower.replace(/[^a-z0-9]/g, "") === lower) return special;

  if (!isFirst && MINOR_WORDS.has(lower)) return lower;

  if (lower.includes("-")) {
    return lower
      .split("-")
      .map((part) => (SPECIAL_CASES[part] ?? capitalise(part)))
      .join("-");
  }

  return capitalise(lower);
}

export function toTitleCase(name: string): string {
  const cleaned = name
    // Repair the handful of mojibake names upstream ("sled 45в° leg press").
    .replace(/в°/g, "°")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return cleaned;

  let wordIndex = 0;
  return cleaned.replace(/[^\s]+/g, (token) => {
    // Bracketed segments restart the "first word" rule: "(back pov)" -> "(Back POV)".
    const opensGroup = token.startsWith("(");
    const isFirst = wordIndex === 0 || opensGroup;
    wordIndex++;

    const leading = token.match(/^[^\p{L}\p{N}]*/u)?.[0] ?? "";
    const trailing = token.match(/[^\p{L}\p{N}]*$/u)?.[0] ?? "";
    const core = token.slice(leading.length, token.length - trailing.length);
    if (!core) return token;

    return leading + caseWord(core, isFirst) + trailing;
  });
}
