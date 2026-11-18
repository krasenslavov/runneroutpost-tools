import { LIMITS } from "@/config/limits";
import { parseCsv } from "./csv";

export type NamesResult = {
  names: string[];
  /** Entries that were left out, as typed, so the screen can say what was skipped. */
  rejected: string[];
  /** True when the list was cut at the cap. */
  truncated: boolean;
};

const NAME_COLUMNS = ["name", "first name", "first_name", "firstname", "first-name"];
// No control characters, no angle brackets.
const PLAIN = /^[^\u0000-\u001f\u007f<>]+$/;

/**
 * Reads a pasted list of first names (one per line or separated by commas) or a CSV with a name
 * column. Imported names are labels, never accounts: anything that looks like an email address or a
 * phone number is refused, so contact details never get stored.
 */
export function parseNames(text: string): NamesResult {
  const header = parseCsv(text.slice(0, 500))[0]?.map((c) => c.trim().toLowerCase()) ?? [];
  const column = header.findIndex((c) => NAME_COLUMNS.includes(c));
  let raw: string[];
  if (column >= 0) {
    raw = parseCsv(text)
      .slice(1)
      .map((r) => r[column] ?? "");
  } else {
    raw = text.split(/[\r\n,;\t]+/);
  }

  const seen = new Set<string>();
  const names: string[] = [];
  const rejected: string[] = [];
  let truncated = false;
  for (const entry of raw) {
    const name = entry
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\s+/g, " ");
    if (!name) continue;
    const digits = (name.match(/\d/g) ?? []).length;
    const bad =
      name.length > LIMITS.group.firstNameMaxLength ||
      !PLAIN.test(name) ||
      name.includes("@") ||
      digits >= 3;
    if (bad) {
      rejected.push(name.slice(0, 40));
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (names.length >= LIMITS.import.maxNames) {
      truncated = true;
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return { names, rejected, truncated };
}
