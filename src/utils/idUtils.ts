/**
 * Generates a short unique ID combining a base-36 timestamp with random characters.
 * The combination provides sufficient uniqueness for local plugin use without
 * requiring a full UUID library.
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
