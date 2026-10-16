/**
 * An audit event's details as rows a person can read (DRD 6.13 "before/after comparison"):
 * a field with its before and after values when the event recorded a change, otherwise
 * each detail on its own. Values are written out plainly; nothing is evaluated.
 */

export type DetailRow = {
  field: string;
  before?: string;
  after?: string;
  value?: string;
  changed: boolean;
};

/** "pcoPersonId" → "Pco person id", "signin_google_enabled" → "Signin google enabled". */
export function fieldLabel(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

export function detailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(detailValue).join(", ") || "—";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${fieldLabel(k)}: ${detailValue(v)}`)
      .join("; ");
  }
  return String(value);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function detailRows(details: Record<string, unknown> | null): DetailRow[] {
  if (!details) return [];
  const before = isRecord(details.before) ? details.before : {};
  const after = isRecord(details.after) ? details.after : {};
  const rows: DetailRow[] = [];
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])]) {
    const b = detailValue(before[key]);
    const a = detailValue(after[key]);
    rows.push({ field: fieldLabel(key), before: b, after: a, changed: b !== a });
  }
  for (const [key, value] of Object.entries(details)) {
    if (key === "before" || key === "after") continue;
    rows.push({ field: fieldLabel(key), value: detailValue(value), changed: false });
  }
  return rows;
}

/** One line for a spreadsheet cell: "Name: Old → New; Count: 3". */
export function detailText(details: Record<string, unknown> | null): string {
  return detailRows(details)
    .map((r) =>
      r.value !== undefined ? `${r.field}: ${r.value}` : `${r.field}: ${r.before} → ${r.after}`,
    )
    .join("; ");
}
