/**
 * Where the bundled exercise catalog comes from, and where its optional extras
 * are fetched from at runtime.
 *
 * Upstream: https://github.com/hasaneyldrm/exercises-dataset
 *
 * Two licences apply and the split drives the design here:
 *   - The data (names, muscles, equipment, instructions) is MIT. It is bundled
 *     into this plugin; see NOTICE.md for the required copyright notice.
 *   - The media in images/ and videos/ is © Gym visual and is NOT MIT. This
 *     plugin never copies it. It writes a URL into the note and the vault
 *     fetches it at render time, which is linking rather than redistribution.
 *
 * Pinned to a commit rather than a branch on purpose: these URLs are written
 * into users' notes permanently, so a file moved or renamed upstream would
 * silently blank out every exercise image in every vault. Bump this only
 * together with a regenerated catalog (scripts/build-catalog.mjs).
 */
export const CATALOG_COMMIT = "7455efae41b330c265e7cd4b78dfa848e7ce5ebd";

/**
 * jsDelivr rather than raw.githubusercontent: it is a real CDN built to serve
 * GitHub content, it sets long cache lifetimes (raw sends max-age=300, so every
 * view re-fetches), and it does not bill the traffic to the dataset author's
 * repository. Confirmed serving this repo.
 */
export const CATALOG_MEDIA_BASE = `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${CATALOG_COMMIT}`;

/** Required on every use of the media, per the upstream NOTICE. */
export const MEDIA_ATTRIBUTION = "© Gym visual — https://gymvisual.com/";

export function mediaImageUrl(mediaId: string): string {
  return `${CATALOG_MEDIA_BASE}/images/${mediaId}.jpg`;
}

export function mediaAnimationUrl(mediaId: string): string {
  return `${CATALOG_MEDIA_BASE}/videos/${mediaId}.gif`;
}
