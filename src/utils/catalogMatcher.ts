import { CatalogExercise } from "./catalogService";

/**
 * Matching user-supplied exercise names against the catalog.
 *
 * Names arrive in wildly different shapes — Strong writes "Bench Press
 * (Barbell)" where the dataset writes "barbell bench press" — so comparison is
 * done on an unordered set of words rather than a string. That single rule
 * covers word order, punctuation and hyphenation at once ("Chin Up" matches
 * "chin-up"), and it is safe to act on automatically: the dataset has 1,316
 * distinct word-sets across 1,324 exercises, and the few collisions are literal
 * duplicates or punctuation variants of each other.
 *
 * It reaches roughly 40% of typical Strong names. The rest miss on vocabulary
 * rather than word order (the dataset has no plain "barbell squat", no
 * unqualified "leg press", nothing named "face pull"), which no normalisation
 * rule can fix — those go to the picker.
 */

export type MatchConfidence = "exact" | "subset" | "fuzzy";

export interface CatalogMatch {
  record: CatalogExercise;
  confidence: MatchConfidence;
  score: number;
}

/**
 * Naive singularisation. Enough to bridge "bicep curl" and "biceps curl"
 * without dragging in a stemmer; deliberately leaves "press" and "cross" alone.
 */
function singularise(token: string): string {
  return token.length > 3 && token.endsWith("s") && !token.endsWith("ss")
    ? token.slice(0, -1)
    : token;
}

export function wordSet(name: string): Set<string> {
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularise);
  return new Set(tokens);
}

function setKey(words: Set<string>): string {
  return [...words].sort().join(" ");
}

function isSubset(inner: Set<string>, outer: Set<string>): boolean {
  if (inner.size >= outer.size) return false;
  for (const word of inner) {
    if (!outer.has(word)) return false;
  }
  return true;
}

/** Longest-common-subsequence ratio, used only to order picker results. */
function sequenceRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = new Array<number>(cols).fill(0);
  let current = new Array<number>(cols).fill(0);

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      current[j] =
        a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
    current = new Array<number>(cols).fill(0);
  }
  return (2 * previous[cols - 1]) / (a.length + b.length);
}

export class CatalogMatcher {
  private byWordSet = new Map<string, CatalogExercise[]>();
  private records: CatalogExercise[];

  constructor(records: CatalogExercise[]) {
    this.records = records;
    for (const record of records) {
      const key = setKey(wordSet(record.name));
      const bucket = this.byWordSet.get(key);
      if (bucket) {
        bucket.push(record);
      } else {
        this.byWordSet.set(key, [record]);
      }
    }
  }

  /**
   * An unambiguous word-set match, safe to apply without asking. Returns null
   * when nothing matches or when more than one distinct exercise shares the
   * word set.
   */
  findExact(name: string): CatalogExercise | null {
    const bucket = this.byWordSet.get(setKey(wordSet(name)));
    if (!bucket?.length) return null;
    const distinct = new Set(bucket.map((record) => record.name.toLowerCase()));
    return distinct.size === 1 ? bucket[0] : null;
  }

  /**
   * Ranked candidates for the picker. Never use these to attach a description
   * automatically: a query like "Squat (Barbell)" scores "barbell full squat",
   * "barbell hack squat" and "barbell jump squat" identically, and none of them
   * is a back squat. A human confirms.
   */
  rankCandidates(name: string, limit = 25): CatalogMatch[] {
    const query = wordSet(name);
    if (!query.size) return [];
    const queryText = [...query].sort().join(" ");

    const scored = this.records.map((record) => {
      const candidate = wordSet(record.name);
      const candidateText = [...candidate].sort().join(" ");

      let shared = 0;
      for (const word of query) {
        if (candidate.has(word)) shared++;
      }
      const union = query.size + candidate.size - shared;
      const jaccard = union ? shared / union : 0;

      let confidence: MatchConfidence = "fuzzy";
      if (jaccard === 1) {
        confidence = "exact";
      } else if (isSubset(query, candidate)) {
        confidence = "subset";
      }

      const score = 0.55 * jaccard + 0.45 * sequenceRatio(queryText, candidateText);
      return { record, confidence, score };
    });

    const rank: Record<MatchConfidence, number> = { exact: 0, subset: 1, fuzzy: 2 };
    return scored
      .sort((a, b) => rank[a.confidence] - rank[b.confidence] || b.score - a.score)
      .slice(0, limit);
  }
}
