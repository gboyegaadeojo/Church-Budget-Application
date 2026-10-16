import { emailCopy } from "@/copy/email";
import { formatCAD, formatTaxRate, type TaxBreakdown, type TaxRate } from "@/lib/money";

/**
 * The one email layout (DRD 7.5): a heading, a plain-language status line, the facts
 * (reference, department, year), what changed, the Subtotal / Sales tax / Total block,
 * the items, a note, "what you need to do" and a button with the plain link beneath it.
 * Every email has a plain-text twin. Single column, 600 px, no images, and nothing that
 * relies on colour alone, so it reads well in dark-mode clients too.
 */

export type EmailBrand = { churchName: string; appName: string };

export type EmailLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type EmailSummary =
  | { kind: "single"; heading?: string; totals: TaxBreakdown; rate: TaxRate }
  | {
      kind: "comparison";
      requested: TaxBreakdown;
      approved: TaxBreakdown;
      rate: TaxRate;
      difference: string;
    };

export type EmailContent = {
  subject: string;
  heading: string;
  /** Plain-language status, e.g. "Approved". Shown as text, never only as a colour. */
  status: string;
  paragraphs?: string[];
  facts?: { label: string; value: string }[];
  changes?: string[];
  /** Any other bulleted list with its own heading, e.g. departments still outstanding. */
  list?: { heading: string; items: string[] };
  summary?: EmailSummary;
  lines?: { heading: string; items: EmailLine[] };
  note?: { label: string; text: string };
  /** "What you need to do"; "Nothing, this is for your records." when nothing is needed. */
  action: string;
  button: { label: string; href: string };
};

export type RenderedEmail = { subject: string; text: string; html: string };

const c = emailCopy.layout;

/** An absolute link into the app. Links carry no data in the query string (CLAUDE.md). */
export function appUrl(
  path: string,
  base = process.env.AUTH_URL ?? "http://localhost:3000",
): string {
  return new URL(path, base).toString();
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEmail(content: EmailContent, brand: EmailBrand): RenderedEmail {
  // Subjects are one line: a newline could start a header in some mail paths.
  const subject = content.subject.replace(/[\r\n]+/g, " ").trim();
  return { subject, text: renderText(content, brand), html: renderHtml(content, brand, subject) };
}

// ---------------------------------------------------------------- plain text

function summaryRows(summary: EmailSummary): [string, string, string?][] {
  const tax = c.salesTax(formatTaxRate(summary.rate));
  if (summary.kind === "single") {
    return [
      [c.subtotal, formatCAD(summary.totals.subtotal)],
      [tax, formatCAD(summary.totals.tax)],
      [c.total, formatCAD(summary.totals.total)],
    ];
  }
  return [
    [c.subtotal, formatCAD(summary.requested.subtotal), formatCAD(summary.approved.subtotal)],
    [tax, formatCAD(summary.requested.tax), formatCAD(summary.approved.tax)],
    [c.total, formatCAD(summary.requested.total), formatCAD(summary.approved.total)],
  ];
}

function renderText(content: EmailContent, brand: EmailBrand): string {
  const out: string[] = [`${brand.churchName} · ${brand.appName}`, "", content.heading, ""];
  out.push(`${c.status}: ${content.status}`, "");
  for (const p of content.paragraphs ?? []) out.push(p, "");
  if (content.facts?.length) {
    for (const f of content.facts) out.push(`${f.label}: ${f.value}`);
    out.push("");
  }
  for (const list of bulletLists(content)) {
    out.push(`${list.heading}:`);
    for (const item of list.items) out.push(`- ${item}`);
    out.push("");
  }
  if (content.summary) {
    const s = content.summary;
    if (s.kind === "single") {
      if (s.heading) out.push(`${s.heading}:`);
      for (const [label, value] of summaryRows(s)) out.push(`${label}: ${value}`);
    } else {
      for (const [label, requested, approved] of summaryRows(s)) {
        out.push(`${label}: ${c.requested} ${requested} · ${c.approved} ${approved}`);
      }
      out.push(`${c.difference}: ${s.difference}`);
    }
    out.push("");
  }
  if (content.lines?.items.length) {
    out.push(`${content.lines.heading}:`);
    for (const l of content.lines.items) out.push(`- ${lineText(l)}`);
    out.push("");
  }
  if (content.note) out.push(`${content.note.label}:`, content.note.text, "");
  out.push(`${c.whatToDo}: ${content.action}`, "");
  out.push(`${content.button.label}: ${content.button.href}`, "");
  out.push("--", c.footer(brand.appName, brand.churchName), c.signInNote);
  return out.join("\n");
}

function bulletLists(content: EmailContent): { heading: string; items: string[] }[] {
  return [
    ...(content.changes?.length ? [{ heading: c.whatChanged, items: content.changes }] : []),
    ...(content.list?.items.length ? [content.list] : []),
  ];
}

function lineText(l: EmailLine): string {
  return `${l.name}: ${l.quantity.toLocaleString("en-CA")} × ${formatCAD(l.unitPriceCents)} = ${formatCAD(l.totalCents)}`;
}

// ---------------------------------------------------------------- HTML

const FONT = "font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const MUTED = "color:#4b5563;";
const CELL = "padding:4px 0;font-size:14px;";
const NUM = `${CELL}text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;`;

function section(inner: string): string {
  return `<tr><td style="padding:0 24px 20px;">${inner}</td></tr>`;
}

function htmlSummary(summary: EmailSummary): string {
  const rows = summaryRows(summary);
  const isTotal = (i: number) => i === rows.length - 1;
  const rowStyle = (i: number) =>
    isTotal(i) ? "border-top:1px solid #d1d5db;font-weight:600;" : "";
  if (summary.kind === "single") {
    const heading = summary.heading
      ? `<p style="margin:0 0 6px;font-size:14px;font-weight:600;">${escapeHtml(summary.heading)}</p>`
      : "";
    const body = rows
      .map(
        ([label, value], i) =>
          `<tr style="${rowStyle(i)}"><th scope="row" style="${CELL}text-align:left;font-weight:${isTotal(i) ? 600 : 400};">${escapeHtml(label)}</th><td style="${NUM}${isTotal(i) ? "font-size:18px;" : ""}">${escapeHtml(value)}</td></tr>`,
      )
      .join("");
    return `${heading}<table role="presentation" width="100%" style="border-collapse:collapse;">${body}</table>`;
  }
  const head = `<tr><td></td><th scope="col" style="${NUM}${MUTED}font-weight:500;font-size:12px;">${escapeHtml(c.requested)}</th><th scope="col" style="${NUM}${MUTED}font-weight:500;font-size:12px;padding-left:16px;">${escapeHtml(c.approved)}</th></tr>`;
  const body = rows
    .map(
      ([label, requested, approved], i) =>
        `<tr style="${rowStyle(i)}"><th scope="row" style="${CELL}text-align:left;font-weight:${isTotal(i) ? 600 : 400};">${escapeHtml(label)}</th><td style="${NUM}">${escapeHtml(requested)}</td><td style="${NUM}padding-left:16px;${isTotal(i) ? "font-size:18px;" : ""}">${escapeHtml(approved ?? "")}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;">${head}${body}</table><p style="margin:8px 0 0;font-size:14px;"><span style="${MUTED}">${escapeHtml(c.difference)}:</span> <strong>${escapeHtml(summary.difference)}</strong></p>`;
}

function htmlLines(lines: { heading: string; items: EmailLine[] }): string {
  const rows = lines.items
    .map(
      (l) =>
        `<tr style="border-top:1px solid #e5e7eb;"><td style="${CELL}">${escapeHtml(l.name)}<br><span style="${MUTED}font-size:13px;">${escapeHtml(`${l.quantity.toLocaleString("en-CA")} × ${formatCAD(l.unitPriceCents)}`)}</span></td><td style="${NUM}">${escapeHtml(formatCAD(l.totalCents))}</td></tr>`,
    )
    .join("");
  return `<p style="margin:0 0 6px;font-size:14px;font-weight:600;">${escapeHtml(lines.heading)}</p><table style="border-collapse:collapse;width:100%;">${rows}</table>`;
}

function renderHtml(content: EmailContent, brand: EmailBrand, subject: string): string {
  const parts: string[] = [];
  parts.push(
    `<tr><td style="padding:24px 24px 8px;"><p style="margin:0;${MUTED}font-size:13px;">${escapeHtml(brand.churchName)} · ${escapeHtml(brand.appName)}</p><h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;">${escapeHtml(content.heading)}</h1></td></tr>`,
  );
  parts.push(
    section(
      `<p style="margin:0;font-size:14px;"><strong>${escapeHtml(c.status)}:</strong> ${escapeHtml(content.status)}</p>`,
    ),
  );
  for (const p of content.paragraphs ?? []) {
    parts.push(section(`<p style="margin:0;font-size:15px;line-height:1.5;">${escapeHtml(p)}</p>`));
  }
  if (content.facts?.length) {
    const rows = content.facts
      .map(
        (f) =>
          `<tr><th scope="row" style="${CELL}${MUTED}text-align:left;font-weight:400;padding-right:16px;">${escapeHtml(f.label)}</th><td style="${CELL}">${escapeHtml(f.value)}</td></tr>`,
      )
      .join("");
    parts.push(section(`<table style="border-collapse:collapse;">${rows}</table>`));
  }
  for (const list of bulletLists(content)) {
    const items = list.items.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    parts.push(
      section(
        `<p style="margin:0 0 6px;font-size:14px;font-weight:600;">${escapeHtml(list.heading)}</p><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5;">${items}</ul>`,
      ),
    );
  }
  if (content.summary) parts.push(section(htmlSummary(content.summary)));
  if (content.lines?.items.length) parts.push(section(htmlLines(content.lines)));
  if (content.note) {
    parts.push(
      section(
        `<div style="border-left:4px solid #9ca3af;padding:8px 12px;"><p style="margin:0 0 4px;font-size:14px;font-weight:600;">${escapeHtml(content.note.label)}</p><p style="margin:0;font-size:14px;line-height:1.5;white-space:pre-line;">${escapeHtml(content.note.text)}</p></div>`,
      ),
    );
  }
  parts.push(
    section(
      `<p style="margin:0;font-size:15px;"><strong>${escapeHtml(c.whatToDo)}:</strong> ${escapeHtml(content.action)}</p>`,
    ),
  );
  const href = escapeHtml(content.button.href);
  parts.push(
    section(
      `<a href="${href}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px;">${escapeHtml(content.button.label)}</a><p style="margin:12px 0 0;font-size:13px;${MUTED}word-break:break-all;">${escapeHtml(c.orOpen)} <a href="${href}" style="color:#1d4ed8;">${href}</a></p>`,
    ),
  );
  parts.push(
    `<tr><td style="padding:16px 24px 24px;border-top:1px solid #e5e7eb;font-size:12px;${MUTED}">${escapeHtml(c.footer(brand.appName, brand.churchName))}<br>${escapeHtml(c.signInNote)}</td></tr>`,
  );

  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:16px 8px;background:#f3f4f6;${FONT}color:#111827;">
<table role="presentation" width="100%" style="border-collapse:collapse;"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:600px;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
${parts.join("\n")}
</table>
</td></tr></table>
</body>
</html>`;
}
