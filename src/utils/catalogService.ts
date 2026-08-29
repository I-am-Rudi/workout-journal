import { CATALOG_INDEX_JSON, CATALOG_COUNT } from "../data/catalogIndex";
import { CATALOG_DESCRIPTIONS_JSON } from "../data/catalogDescriptions";

export interface CatalogExercise {
  /** Upstream dataset id, stored on imported notes as `wj-source-id`. */
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  /** Basename of the upstream media files, e.g. "0001-2gPfomN". */
  mediaId: string;
}

interface EncodedIndex {
  b: string[];
  e: string[];
  m: string[];
  x: [string, string, number, number, number, number[], string][];
}

export const CATALOG_SOURCE_KEY = "exercises-dataset";

/**
 * Read access to the bundled exercise catalog.
 *
 * Everything ships inside main.js — Obsidian only downloads main.js,
 * manifest.json and styles.css from a release, so a separate data file would
 * never reach anyone installing from the community directory. Both payloads are
 * JSON strings rather than object literals, so nothing is parsed until the user
 * actually opens the catalog, and neither costs anything at plugin load.
 *
 * The media is the one piece that is *not* bundled: it is licensed separately
 * and is only ever linked to. See catalogSource.ts.
 */
export class CatalogService {
  private index: CatalogExercise[] | null = null;
  private descriptions: Record<string, string> | null = null;
  private facetCache: { bodyParts: string[]; equipment: string[]; targets: string[] } | null = null;

  get size(): number {
    return CATALOG_COUNT;
  }

  /** Decodes the bundled index on first use, then reuses it. */
  loadIndex(): CatalogExercise[] {
    if (this.index) return this.index;

    const encoded = JSON.parse(CATALOG_INDEX_JSON) as EncodedIndex;
    this.index = encoded.x.map((row) => ({
      id: row[0],
      name: row[1],
      bodyPart: encoded.b[row[2]] ?? "",
      equipment: encoded.e[row[3]] ?? "",
      target: encoded.m[row[4]] ?? "",
      secondaryMuscles: row[5].map((i) => encoded.m[i] ?? "").filter(Boolean),
      mediaId: row[6],
    }));

    this.facetCache = {
      bodyParts: [...encoded.b].filter(Boolean).sort(),
      equipment: [...encoded.e].filter(Boolean).sort(),
      targets: [...new Set(this.index.map((exercise) => exercise.target))].filter(Boolean).sort(),
    };

    return this.index;
  }

  getById(id: string): CatalogExercise | undefined {
    return this.loadIndex().find((exercise) => exercise.id === id);
  }

  /** Distinct filter values, for the browse modal's dropdowns. */
  facets(): { bodyParts: string[]; equipment: string[]; targets: string[] } {
    this.loadIndex();
    return this.facetCache ?? { bodyParts: [], equipment: [], targets: [] };
  }

  /** English instruction text, parsed on first request. */
  getDescription(id: string): string | undefined {
    if (!this.descriptions) {
      this.descriptions = JSON.parse(CATALOG_DESCRIPTIONS_JSON) as Record<string, string>;
    }
    const text = this.descriptions[id];
    return text && text.trim() ? text.trim() : undefined;
  }
}
