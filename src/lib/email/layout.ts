import { emailCopy } from "@/copy/email";
import {
  formatCAD,
  formatTaxRate,
  isZeroTaxRate,
  type TaxBreakdown,
  type TaxRate,
} from "@/lib/money";

/**
 * The one email layout, in the "Ledger" design (docs/decisions.md, 2026-11-08; DRD 7.5):
 * a white card with the church's logo and a status chip in words, an optional eyebrow and
 * big number, a heading, a note signed by the person who wrote it, progress steps, the
 * facts as ruled rows, the Subtotal / Sales tax / Total block, the items, "what you need
 * to do", a compact button with the plain link beneath it, and a quiet footer.
 *
 * Every email has a plain-text twin. Tables and inline styles only, because mail apps
 * ignore most CSS; 600 px wide; no images but the church's logo (FR-30), and nothing that
 * relies on colour alone. Plus Jakarta Sans where the mail app loads web fonts (Apple Mail,
 * iOS, Outlook for Mac), the system font everywhere else.
 */

export type EmailBrand = {
  churchName: string;
  appName: string;
  /** An absolute URL of the PNG or JPEG logo (FR-30); null shows the names only. */
  logoUrl?: string | null;
  /** The administrator's checked accent for the button; null keeps the default blue. */
  accent?: string | null;
};

export type EmailLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type EmailSummary =
  | { kind: "single"; heading?: string; totals: TaxBreakdown; rate: TaxRate }
  /** An expense claim: receipts already include tax, so one "Total paid" line (FR-41). */
  | { kind: "paid"; heading?: string; label: string; totalCents: number }
  | {
      kind: "comparison";
      requested: TaxBreakdown;
      approved: TaxBreakdown;
      rate: TaxRate;
      difference: string;
    };

/** A step in "where this stands": done, the one it's on now, or still to come. */
export type EmailStep = { label: string; detail?: string; state: "done" | "current" | "next" };

export type EmailContent = {
  subject: string;
  /** The line mail apps show after the subject. Defaults to the first paragraph. */
  preheader?: string;
  /** A small line above the heading, e.g. "Media Team · FY2027 · IFC-2027-0007". */
  eyebrow?: string;
  heading: string;
  /** Plain-language status, e.g. "Approved". Shown as text, never only as a colour. */
  status: string;
  /**
   * The status chip's colour: good (approved, paid), waiting (someone must act) or neutral.
   * Defaults to waiting when there's something to do, otherwise neutral.
   */
  tone?: "good" | "waiting" | "neutral";
  /** The one number the email is about, shown large, e.g. an approved total. */
  hero?: { value: string; caption?: string };
  /** A one-time code, shown large in a single box so it copies cleanly. */
  code?: string;
  paragraphs?: string[];
  steps?: EmailStep[];
  facts?: { label: string; value: string }[];
  changes?: string[];
  /** Any other bulleted list with its own heading, e.g. departments still outstanding. */
  list?: { heading: string; items: string[] };
  summary?: EmailSummary;
  lines?: { heading: string; items: EmailLine[] };
  /** A note or question; with `author`, it reads as a message from that person. */
  note?: { label: string; text: string; author?: string };
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

/** "Grace" from "Grace Mensah", for buttons like "Answer Grace". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

// ---------------------------------------------------------------- plain text

function summaryRows(summary: EmailSummary): [string, string, string?][] {
  if (summary.kind === "paid") return [[summary.label, formatCAD(summary.totalCents)]];
  const tax = isZeroTaxRate(summary.rate) ? c.noSalesTax : c.salesTax(formatTaxRate(summary.rate));
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

function stepText(s: EmailStep): string {
  const detail = s.detail ? ` ${s.detail}` : "";
  return `${s.label}${detail}${s.state === "current" ? ` (${c.now})` : ""}`;
}

function renderText(content: EmailContent, brand: EmailBrand): string {
  const out: string[] = [`${brand.churchName} · ${brand.appName}`, ""];
  if (content.eyebrow) out.push(content.eyebrow);
  out.push(content.heading, "");
  out.push(`${c.status}: ${content.status}`, "");
  if (content.code) out.push(`${c.code}: ${content.code}`, "");
  if (content.hero) {
    out.push(content.hero.value);
    if (content.hero.caption) out.push(content.hero.caption);
    out.push("");
  }
  for (const p of content.paragraphs ?? []) out.push(p, "");
  if (content.note) {
    const by = content.note.author ? ` (${content.note.author})` : "";
    out.push(`${content.note.label}${by}:`, content.note.text, "");
  }
  if (content.steps?.length) {
    out.push(`${c.progress}: ${content.steps.map(stepText).join(" → ")}`, "");
  }
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
    if (s.kind !== "comparison") {
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

const INK = "#0b0b0c";
const BODY = "#3d4049";
const MUTED = "#5e626b";
const LINE = "#e7e8eb";
const SOFT = "#f6f6f7";
const PAGE = "#f2f3f5";
const TONES = {
  good: { bg: "#e7f4ec", fg: "#16794a" },
  waiting: { bg: "#fff2dc", fg: "#8a4b00" },
  neutral: { bg: SOFT, fg: INK },
} as const;
const FONT =
  "font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const NUMS = "font-variant-numeric:tabular-nums;";
const LABEL = `margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};`;
const CELL = `padding:9px 0;font-size:14px;border-bottom:1px solid ${LINE};`;
const NUM = `${CELL}text-align:right;${NUMS}white-space:nowrap;`;
const TOTAL = "border-bottom:0;font-weight:700;font-size:15px;";

function section(inner: string): string {
  return `<tr><td style="padding:0 28px 22px;">${inner}</td></tr>`;
}

function label(text: string): string {
  return `<p style="${LABEL}">${escapeHtml(text)}</p>`;
}

function htmlSummary(summary: EmailSummary): string {
  const rows = summaryRows(summary);
  const isTotal = (i: number) => i === rows.length - 1;
  const cell = (i: number) => (isTotal(i) ? `${CELL}${TOTAL}` : CELL);
  const num = (i: number) => (isTotal(i) ? `${NUM}${TOTAL}` : NUM);
  const name = (text: string, i: number) =>
    `<th scope="row" style="${cell(i)}text-align:left;font-weight:${isTotal(i) ? 700 : 400};">${escapeHtml(text)}</th>`;
  if (summary.kind !== "comparison") {
    const heading = summary.heading ? label(summary.heading) : "";
    const body = rows
      .map(
        ([text, value], i) =>
          `<tr>${name(text, i)}<td style="${num(i)}">${escapeHtml(value)}</td></tr>`,
      )
      .join("");
    return `${heading}<table role="presentation" width="100%" style="border-collapse:collapse;color:${INK};">${body}</table>`;
  }
  const col = `padding:0 0 4px;text-align:right;font-size:12px;font-weight:500;color:${MUTED};`;
  const head = `<tr><td style="padding:0 0 4px;"></td><th scope="col" style="${col}">${escapeHtml(c.requested)}</th><th scope="col" style="${col}padding-left:16px;">${escapeHtml(c.approved)}</th></tr>`;
  const body = rows
    .map(
      ([text, requested, approved], i) =>
        `<tr>${name(text, i)}<td style="${num(i)}color:${MUTED};">${escapeHtml(requested)}</td><td style="${num(i)}padding-left:16px;">${escapeHtml(approved ?? "")}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;color:${INK};">${head}${body}</table><p style="margin:10px 0 0;font-size:14px;color:${MUTED};">${escapeHtml(c.difference)}: <strong style="color:${INK};">${escapeHtml(summary.difference)}</strong></p>`;
}

function htmlLines(lines: { heading: string; items: EmailLine[] }): string {
  const rows = lines.items
    .map(
      (l) =>
        `<tr><td style="${CELL}">${escapeHtml(l.name)}<br><span style="color:${MUTED};font-size:12px;">${escapeHtml(`${l.quantity.toLocaleString("en-CA")} × ${formatCAD(l.unitPriceCents)}`)}</span></td><td style="${NUM}font-weight:600;vertical-align:top;">${escapeHtml(formatCAD(l.totalCents))}</td></tr>`,
    )
    .join("");
  return `${label(lines.heading)}<table style="border-collapse:collapse;width:100%;color:${INK};">${rows}</table>`;
}

function htmlFacts(facts: { label: string; value: string }[]): string {
  const rows = facts
    .map(
      (f) =>
        `<tr><th scope="row" style="${CELL}color:${MUTED};text-align:left;font-weight:400;padding-right:16px;">${escapeHtml(f.label)}</th><td style="${CELL}text-align:right;font-weight:500;color:${INK};">${escapeHtml(f.value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid ${LINE};">${rows}</table>`;
}

function htmlSteps(steps: EmailStep[], accent: string): string {
  const width = Math.floor(100 / steps.length);
  const cells = steps
    .map((s, i) => {
      const bar = s.state === "done" ? INK : s.state === "current" ? accent : LINE;
      const text = s.state === "next" ? MUTED : INK;
      const detail = s.detail ?? (s.state === "current" ? c.now : "");
      const gap = i < steps.length - 1 ? 6 : 0;
      return `<td width="${width}%" style="vertical-align:top;padding:0 ${gap}px 0 0;"><div style="height:4px;line-height:4px;font-size:0;border-radius:2px;background:${bar};">&nbsp;</div><p style="margin:6px 0 0;font-size:12px;font-weight:600;color:${text};">${escapeHtml(s.label)}</p><p style="margin:0;font-size:12px;color:${MUTED};${NUMS}">${escapeHtml(detail)}</p></td>`;
    })
    .join("");
  return `${label(c.progress)}<table role="presentation" width="100%" style="border-collapse:collapse;"><tr>${cells}</tr></table>`;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function htmlNote(note: NonNullable<EmailContent["note"]>): string {
  const byline = note.author ? `${note.author} · ${note.label}` : note.label;
  const bubble = `<div style="background:${SOFT};border-radius:4px 16px 16px 16px;padding:12px 14px;"><p style="margin:0 0 4px;font-size:12px;color:${MUTED};">${escapeHtml(byline)}</p><p style="margin:0;font-size:15px;line-height:1.5;color:${INK};white-space:pre-line;">${escapeHtml(note.text)}</p></div>`;
  if (!note.author) return bubble;
  return `<table role="presentation" width="100%" style="border-collapse:collapse;"><tr><td width="48" style="vertical-align:top;padding-right:12px;"><div style="width:36px;height:36px;line-height:36px;border-radius:18px;background:${SOFT};border:1px solid ${LINE};text-align:center;font-size:13px;font-weight:700;color:${INK};">${escapeHtml(initials(note.author))}</div></td><td style="vertical-align:top;">${bubble}</td></tr></table>`;
}

/** One box with spaced digits, so copying gives "169964", not a digit per cell. */
function htmlCode(code: string): string {
  return `<div style="display:inline-block;background:${SOFT};border:1px solid ${LINE};border-radius:14px;padding:14px 18px 14px 26px;font-size:34px;line-height:1;font-weight:700;letter-spacing:0.3em;color:${INK};${NUMS}">${escapeHtml(code)}</div>`;
}

/** The logo beside the names, sized by height so wide and square logos both fit. */
function brandHtml(brand: EmailBrand): string {
  const names = `<p style="margin:0;font-size:14px;line-height:1.25;font-weight:700;color:${INK};">${escapeHtml(brand.appName)}</p><p style="margin:0;font-size:12px;line-height:1.3;color:${MUTED};">${escapeHtml(brand.churchName)}</p>`;
  if (!brand.logoUrl || !/^https?:\/\//.test(brand.logoUrl)) return names;
  return `<table role="presentation" style="border-collapse:collapse;"><tr><td style="padding-right:10px;vertical-align:middle;"><img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.churchName)}" height="28" style="display:block;height:28px;width:auto;max-width:120px;border:0;"></td><td style="vertical-align:middle;">${names}</td></tr></table>`;
}

function renderHtml(content: EmailContent, brand: EmailBrand, subject: string): string {
  const accent = brand.accent && /^#[0-9a-f]{6}$/.test(brand.accent) ? brand.accent : "#1d4ed8";
  const noAction = content.action === emailCopy.noAction;
  const tone = TONES[content.tone ?? (noAction ? "neutral" : "waiting")];
  const parts: string[] = [];

  parts.push(
    `<tr><td style="padding:18px 28px;border-bottom:1px solid ${LINE};"><table role="presentation" width="100%" style="border-collapse:collapse;"><tr><td style="vertical-align:middle;">${brandHtml(brand)}</td><td align="right" style="vertical-align:middle;padding-left:12px;"><span style="display:inline-block;white-space:nowrap;background:${tone.bg};color:${tone.fg};font-size:12px;font-weight:600;padding:5px 10px;border-radius:999px;">${escapeHtml(content.status)}</span></td></tr></table></td></tr>`,
  );
  const eyebrow = content.eyebrow
    ? `<p style="margin:0 0 4px;font-size:12px;color:${MUTED};">${escapeHtml(content.eyebrow)}</p>`
    : "";
  parts.push(
    `<tr><td style="padding:28px 28px 22px;">${eyebrow}<h1 style="margin:0;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${INK};">${escapeHtml(content.heading)}</h1></td></tr>`,
  );
  if (content.code) parts.push(section(htmlCode(content.code)));
  if (content.hero) {
    const caption = content.hero.caption
      ? `<p style="margin:8px 0 0;font-size:14px;color:${MUTED};">${escapeHtml(content.hero.caption)}</p>`
      : "";
    parts.push(
      section(
        `<p style="margin:0;font-size:40px;line-height:1;font-weight:700;letter-spacing:-0.03em;color:${INK};${NUMS}">${escapeHtml(content.hero.value)}</p>${caption}`,
      ),
    );
  }
  for (const p of content.paragraphs ?? []) {
    parts.push(
      section(
        `<p style="margin:0;font-size:15px;line-height:1.55;color:${BODY};">${escapeHtml(p)}</p>`,
      ),
    );
  }
  if (content.note) parts.push(section(htmlNote(content.note)));
  if (content.steps?.length) parts.push(section(htmlSteps(content.steps, accent)));
  if (content.facts?.length) parts.push(section(htmlFacts(content.facts)));
  for (const list of bulletLists(content)) {
    const items = list.items.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    parts.push(
      section(
        `${label(list.heading)}<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:${INK};">${items}</ul>`,
      ),
    );
  }
  if (content.summary) parts.push(section(htmlSummary(content.summary)));
  if (content.lines?.items.length) parts.push(section(htmlLines(content.lines)));
  // "Nothing, this is for your records." is said by the neutral chip; the text twin keeps it.
  if (!noAction) {
    parts.push(
      section(
        `<div style="background:${SOFT};border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.5;color:${INK};"><strong>${escapeHtml(c.whatToDo)}:</strong> ${escapeHtml(content.action)}</div>`,
      ),
    );
  }
  const href = escapeHtml(content.button.href);
  parts.push(
    `<tr><td style="padding:0 28px 26px;"><a href="${href}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;line-height:1.2;padding:10px 16px;border-radius:10px;">${escapeHtml(content.button.label)}</a><p style="margin:12px 0 0;font-size:12px;color:${MUTED};word-break:break-all;">${escapeHtml(c.orOpen)} <a href="${href}" style="color:${accent};">${href}</a></p></td></tr>`,
  );
  parts.push(
    `<tr><td style="padding:18px 28px 22px;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(c.footer(brand.appName, brand.churchName))}<br>${escapeHtml(c.signInNote)}</td></tr>`,
  );

  const preheader = content.preheader ?? content.paragraphs?.[0] ?? content.action;
  // Filler after the preheader stops mail apps pulling body text into the preview line.
  const filler = "&#847;&zwnj;&nbsp;".repeat(40);

  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:24px 12px;background:${PAGE};${FONT}color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}${filler}</div>
<table role="presentation" width="100%" style="border-collapse:collapse;"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:600px;border-collapse:separate;background:#ffffff;border:1px solid ${LINE};border-radius:20px;${FONT}text-align:left;">
${parts.join("\n")}
</table>
</td></tr></table>
</body>
</html>`;
}
