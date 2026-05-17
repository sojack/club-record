/**
 * Normalize a record-list display title from an uploaded filename.
 *
 * Filenames arrive in inconsistent conventions — e.g. `Men_LCM_National.csv`
 * (underscores, already cased) and `men-lcm-national-relays.csv` (dashes,
 * lowercase). The displayed title must be consistent regardless of source:
 * separators become single spaces and each word is capitalized, while known
 * course acronyms stay uppercase.
 *
 *   "Men_LCM_National"        -> "Men LCM National"
 *   "men-lcm-national-relays" -> "Men LCM National Relays"
 *
 * Pass the filename with the extension already stripped (callers compute this).
 */
const ACRONYMS = new Set(["LCM", "SCM", "SCY"]);

export function normalizeListTitle(nameWithoutExt: string): string {
  return nameWithoutExt
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
