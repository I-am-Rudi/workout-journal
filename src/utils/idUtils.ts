/**
 * Generates a short unique ID combining a base-36 timestamp with random characters.
 * The combination provides sufficient uniqueness for local plugin use without
 * requiring a full UUID library.
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Converts a human-readable name into a URL-safe lowercase ID.
 * Falls back to a generated unique ID if the name produces an empty string.
 */
export function createIdFromName(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const trimmed = normalized.replace(/^-+|-+$/g, "");
  return trimmed || `workout-${generateId()}`;
}
