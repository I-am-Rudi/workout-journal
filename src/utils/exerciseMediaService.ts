import { App, TFile, normalizePath, requestUrl } from "obsidian";
import { CatalogExercise } from "./catalogService";
import { MEDIA_ATTRIBUTION, mediaAnimationUrl, mediaImageUrl } from "./catalogSource";

/**
 * How an imported exercise gets its picture.
 *
 *   none   — no image at all
 *   remote — the note embeds a CDN URL; the vault fetches it when rendering.
 *            Linking rather than copying, which is what keeps this clear of the
 *            media licence (see catalogSource.ts).
 *   local  — the file is downloaded into the vault for offline use. Fully
 *            implemented, deliberately not offered in settings yet: saving a
 *            personal copy is the user's call to make, and exposing it is a
 *            one-line change to EXPOSED_IMAGE_MODES below.
 *
 * Every code path handles all three. A user who sets "local" by hand in
 * data.json gets the working behaviour, which also keeps the download path
 * exercised rather than rotting behind a disabled flag.
 */
export type ExerciseImageMode = "none" | "remote" | "local";

export const EXERCISE_IMAGE_MODES: ExerciseImageMode[] = ["none", "remote", "local"];

/** Add "local" here to expose offline images in settings. Nothing else changes. */
export const EXPOSED_IMAGE_MODES: ExerciseImageMode[] = ["none", "remote"];

export const EXERCISE_IMAGE_MODE_LABELS: Record<ExerciseImageMode, string> = {
  none: "No image",
  remote: "Link to the image online",
  local: "Save the image in my vault",
};

export const EXERCISE_IMAGE_MODE_DESCRIPTIONS: Record<ExerciseImageMode, string> = {
  none: "Import the description only.",
  remote: "The note links to the picture; it loads when you have a connection.",
  local: "Download the picture into your vault so it works offline.",
};

/** Subfolder of the exercise library that holds downloaded media. */
const MEDIA_FOLDER = "media";

export interface ResolvedMedia {
  /** Markdown to place at the top of the description, or "" for no image. */
  markdown: string;
  attribution?: string;
  /** Vault-relative path, only set in "local" mode. */
  vaultPath?: string;
}

export function isImageMode(value: unknown): value is ExerciseImageMode {
  return typeof value === "string" && EXERCISE_IMAGE_MODES.includes(value as ExerciseImageMode);
}

export class ExerciseMediaService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Turns a catalog record into the embed that goes into the note. This is the
   * only place that knows which mode is active — callers just take the string.
   */
  async resolveMedia(
    record: Pick<CatalogExercise, "mediaId">,
    mode: ExerciseImageMode,
    libraryFolder: string,
    animated = false
  ): Promise<ResolvedMedia> {
    if (mode === "none" || !record.mediaId) {
      return { markdown: "" };
    }

    const url = animated ? mediaAnimationUrl(record.mediaId) : mediaImageUrl(record.mediaId);

    if (mode === "remote") {
      return { markdown: `![](${url})`, attribution: MEDIA_ATTRIBUTION };
    }

    const vaultPath = await this.ensureLocalCopy(record.mediaId, url, libraryFolder, animated);
    if (!vaultPath) {
      // Downloading failed; fall back to the link so the note is still useful.
      return { markdown: `![](${url})`, attribution: MEDIA_ATTRIBUTION };
    }
    return {
      markdown: `![[${vaultPath}]]`,
      attribution: MEDIA_ATTRIBUTION,
      vaultPath,
    };
  }

  /** Downloads the media once; reuses the file on every later import. */
  private async ensureLocalCopy(
    mediaId: string,
    url: string,
    libraryFolder: string,
    animated: boolean
  ): Promise<string | null> {
    const folder = normalizePath(`${libraryFolder}/${MEDIA_FOLDER}`);
    const path = normalizePath(`${folder}/${mediaId}.${animated ? "gif" : "jpg"}`);

    const existing = this.app.vault.getFileByPath(path);
    if (existing) return path;

    try {
      if (!this.app.vault.getFolderByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
    } catch {
      // Another import may have created it between the check and the call.
      if (!this.app.vault.getFolderByPath(folder)) return null;
    }

    try {
      const response = await requestUrl({ url });
      await this.app.vault.createBinary(path, response.arrayBuffer);
      return path;
    } catch (error) {
      console.error(`Workout Journal: could not download exercise media ${mediaId}`, error);
      return null;
    }
  }

  /**
   * Rewrites an existing note's embed to a different mode.
   *
   * This is what makes a later switch retroactive instead of import-only, which
   * is why `wj-media-id` is stamped on every imported note. Only the media line
   * inside the description changes; the user's notes are not touched.
   */
  async convertNoteMedia(
    file: TFile,
    mediaId: string,
    mode: ExerciseImageMode,
    libraryFolder: string,
    animated = false
  ): Promise<ResolvedMedia> {
    const resolved = await this.resolveMedia({ mediaId }, mode, libraryFolder, animated);
    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      frontmatter["wj-media-mode"] = mode;
    });
    return resolved;
  }
}

/** Strips a leading image embed from a description block. */
export function stripMediaEmbed(description: string): string {
  return description
    .replace(/^!\[[^\]]*\]\([^)]*\)\s*/, "")
    .replace(/^!\[\[[^\]]*\]\]\s*/, "")
    .trimStart();
}

/** Assembles the description body: picture, text, then the required notice. */
export function composeDescription(
  media: ResolvedMedia,
  text: string | undefined
): string {
  const parts: string[] = [];
  if (media.markdown) parts.push(media.markdown);
  if (text?.trim()) parts.push(text.trim());
  if (media.markdown && media.attribution) parts.push(`*${media.attribution}*`);
  return parts.join("\n\n");
}
