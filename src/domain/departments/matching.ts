/** Department name helpers: tidy names, split a pasted list, and find close matches (FR-03). */

/** Trims and collapses inner spaces: "  Media   Team " → "Media Team". */
export function tidyName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** One name per line; blanks dropped; duplicates (ignoring case) kept once, first spelling wins. */
export function parseNameList(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = tidyName(line);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = temp;
    }
  }
  return prev[b.length];
}

/**
 * Names on the list that look like `typed` ("Media Ministri" → "Media Ministry"):
 * a small edit distance, or one name containing the other. Closest first.
 */
export function closeMatches(typed: string, names: readonly string[], limit = 3): string[] {
  const t = tidyName(typed).toLowerCase();
  if (!t) return [];
  return names
    .map((name) => {
      const n = name.toLowerCase();
      const distance = levenshtein(t, n);
      const contains = n.includes(t) || t.includes(n);
      const close = distance <= Math.max(2, Math.floor(Math.max(t.length, n.length) * 0.25));
      return { name, distance, match: n !== t && (close || contains) };
    })
    .filter((m) => m.match)
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((m) => m.name);
}
