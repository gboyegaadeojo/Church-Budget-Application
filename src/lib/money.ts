/**
 * Money helpers (CLAUDE.md "Money and tax", Requirements FR-07, FR-07a, FR-16).
 *
 * Amounts are integer cents held in safe JavaScript integers. Every multiplication or
 * division runs in BigInt, so no binary floating point ever touches money. The tax
 * rate is an exact decimal string with up to 4 places ("0.1200"), matching the
 * NUMERIC(5,4) column; internally it is a whole number of ten-thousandths.
 *
 * Rounding is half-up to the cent ($0.005 → $0.01). For negative amounts it rounds
 * half away from zero, so a negative amount mirrors its positive one exactly.
 */

/** A tax rate as an exact decimal string, e.g. "0.1200" for 12%. */
export type TaxRate = string;

export const DEFAULT_TAX_RATE: TaxRate = "0.1200";

/** Largest quantity and unit price a line accepts (Requirements 11, rule 26). */
export const MAX_QUANTITY = 10_000;
export const MAX_UNIT_PRICE_CENTS = 100_000_000;

const RATE_SCALE = 10_000n;
const RATE_PATTERN = /^(0|[1-9])(?:\.(\d{1,4}))?$/;

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertCents(cents: number): void {
  if (!isCents(cents)) {
    throw new TypeError(`Money must be a whole number of cents, got ${cents}`);
  }
}

function toCents(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`Amount out of range: ${value} cents`);
  return n;
}

/** Divides and rounds half away from zero. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let q = n / d;
  if ((n % d) * 2n >= d) q += 1n;
  return negative ? -q : q;
}

/** Parses "0.12" or "0.1200" into ten-thousandths (1200n). Rejects anything else. */
export function parseTaxRate(rate: TaxRate): bigint {
  const match = RATE_PATTERN.exec(rate);
  if (!match) throw new TypeError(`Tax rate must be a decimal like "0.1200", got "${rate}"`);
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(4, "0"));
  const value = whole * RATE_SCALE + fraction;
  if (value > RATE_SCALE) throw new RangeError(`Tax rate must be at most 1, got "${rate}"`);
  return value;
}

/** The canonical 4-place form stored in the database: "0.12" → "0.1200". */
export function normalizeTaxRate(rate: TaxRate): TaxRate {
  const value = parseTaxRate(rate);
  return `${value / RATE_SCALE}.${String(value % RATE_SCALE).padStart(4, "0")}`;
}

/** The rate as people read it: "0.1200" → "12%", "0.1250" → "12.5%". */
export function formatTaxRate(rate: TaxRate): string {
  const value = parseTaxRate(rate); // hundredths of a percent
  const whole = value / 100n;
  const fraction = String(value % 100n)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

const PERCENT_PATTERN = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

/** What an administrator types ("12", "12.5", "7.05") as a stored rate ("0.1200"); null if invalid or over 100. */
export function percentToTaxRate(percent: string): TaxRate | null {
  const m = PERCENT_PATTERN.exec(percent.trim().replace(/%$/, "").trim());
  if (!m) return null;
  const hundredths = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0")); // = ten-thousandths
  if (hundredths > RATE_SCALE) return null;
  return `${hundredths / RATE_SCALE}.${String(hundredths % RATE_SCALE).padStart(4, "0")}`;
}

/** A stored rate as the percent an administrator edits: "0.1250" → "12.5". */
export function taxRateToPercent(rate: TaxRate): string {
  return formatTaxRate(rate).replace(/%$/, "");
}

/** Line total = quantity × unit price (before tax). Quantity is a whole number above zero. */
export function lineTotal(quantity: number, unitPriceCents: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError(`Quantity must be a whole number above zero, got ${quantity}`);
  }
  assertCents(unitPriceCents);
  if (unitPriceCents < 0) throw new RangeError("Unit price cannot be negative");
  return toCents(BigInt(quantity) * BigInt(unitPriceCents));
}

/** Sum of amounts in cents. */
export function sumCents(amounts: readonly number[]): number {
  let total = 0n;
  for (const amount of amounts) {
    assertCents(amount);
    total += BigInt(amount);
  }
  return toCents(total);
}

/** Sales tax on a subtotal, calculated once and rounded half-up to the cent (FR-07a). */
export function taxForward(subtotalCents: number, rate: TaxRate): number {
  assertCents(subtotalCents);
  return toCents(divRoundHalfUp(BigInt(subtotalCents) * parseTaxRate(rate), RATE_SCALE));
}

export type TaxBreakdown = { subtotal: number; tax: number; total: number };

/** Subtotal → { subtotal, tax, total }: the requester's form and line-item approvals (FR-07). */
export function totalForward(subtotalCents: number, rate: TaxRate): TaxBreakdown {
  const tax = taxForward(subtotalCents, rate);
  return { subtotal: subtotalCents, tax, total: sumCents([subtotalCents, tax]) };
}

/**
 * Total including tax → { subtotal, tax, total } (FR-16 "approve a different amount",
 * amendments). subtotal = round half-up(total ÷ (1 + rate)); tax = total − subtotal,
 * so the total stays exactly the figure entered.
 */
export function splitInclusive(totalCents: number, rate: TaxRate): TaxBreakdown {
  assertCents(totalCents);
  const subtotal = toCents(
    divRoundHalfUp(BigInt(totalCents) * RATE_SCALE, RATE_SCALE + parseTaxRate(rate)),
  );
  return { subtotal, tax: toCents(BigInt(totalCents) - BigInt(subtotal)), total: totalCents };
}

/** Formats cents as "$1,148.00". Negative amounts use a true minus sign (DRD 3.7). */
export function formatCAD(cents: number): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const rem = abs % 100;
  // Intl only ever sees whole dollars (exact as integers); the cents are put into the
  // fraction part as text, so no float rounding can leak in at any size.
  const formatted = CAD.formatToParts(dollars)
    .map((part) => (part.type === "fraction" ? String(rem).padStart(2, "0") : part.value))
    .join("");
  return cents < 0 ? `−${formatted}` : formatted;
}

const AMOUNT_PATTERN = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/;

/**
 * Parses what a person typed ("1,025", "$1,025.50", ".5") into cents, without floats.
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 */
export function parseCAD(input: string): number | null {
  const match = AMOUNT_PATTERN.exec(input.trim());
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const dollars = BigInt((match[1] ?? "0").replaceAll(",", ""));
  const cents = BigInt((match[2] ?? "").padEnd(2, "0"));
  const value = dollars * 100n + cents;
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
}
