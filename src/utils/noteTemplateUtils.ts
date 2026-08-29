import { parseYaml } from "obsidian";

/**
 * Parses a YAML string into a plain object suitable for merging into frontmatter.
 * Returns an empty object if the input is blank or cannot be parsed.
 */
export function parseTemplateFrontmatter(yaml: string | undefined): Record<string, unknown> {
  if (!yaml?.trim()) return {};
  try {
    const parsed = parseYaml(yaml) as Record<string, unknown> | null | unknown[];
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

/**
 * Appends optional template body text beneath a generated note string.
 * Ensures exactly one blank line separates the generated content from the appended text.
 */
export function appendTemplateBody(base: string, templateBody: string | undefined): string {
  const trimmed = templateBody?.trim();
  if (!trimmed) return base;
  return base.endsWith("\n") ? `${base}\n${trimmed}\n` : `${base}\n\n${trimmed}\n`;
}
