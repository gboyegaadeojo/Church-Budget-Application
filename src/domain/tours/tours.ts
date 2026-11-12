/**
 * The guided tours (decided 2026-11-12): a short walk through the real annual budget and
 * new expense forms. Each step lights up one part of a page, found by its `data-tour`
 * name, and says what to do there. The tour itself saves nothing; the person fills in
 * the form as usual. Shared by the server (who is offered which tour) and the browser.
 */

export const TOUR_IDS = ["annual", "expense"] as const;
export type TourId = (typeof TOUR_IDS)[number];

/** How a person left a tour: either way, the first-time offer stops showing. */
export const TOUR_OUTCOMES = ["finished", "dismissed"] as const;
export type TourOutcome = (typeof TOUR_OUTCOMES)[number];

/** The pages a step can be on. */
export type TourPage = "annual-new" | "annual-edit" | "expense-new" | "expense-edit";

const PAGE_PATTERNS: Record<TourPage, RegExp> = {
  "annual-new": /^\/annual\/new\/?$/,
  "annual-edit": /^\/annual\/[^/]+\/edit\/?$/,
  "expense-new": /^\/expenses\/new\/?$/,
  "expense-edit": /^\/expenses\/[^/]+\/edit\/?$/,
};

/** Where "Take me there" goes for a page; edit pages are reached from the start page. */
export const PAGE_HREF: Record<TourPage, string> = {
  "annual-new": "/annual/new",
  "annual-edit": "/annual/new",
  "expense-new": "/expenses/new",
  "expense-edit": "/expenses/new",
};

export type TourStep = {
  /** The step's words live in src/copy/tours.ts under this id. */
  id: string;
  page: TourPage;
  /** The `data-tour` name of the part to light up. */
  target: string;
  /** Pressing the lit-up part is the step's action, so it moves the tour on. */
  advanceOnClick?: boolean;
  /**
   * Only for this kind of expense: the step is skipped on a form whose `data-tour-type`
   * names the other kind (an expense claim has no sales tax switch).
   */
  onlyForType?: "purchase_request" | "expense_claim";
};

export const TOURS: Record<TourId, readonly TourStep[]> = {
  annual: [
    { id: "department", page: "annual-new", target: "annual-department" },
    { id: "continue", page: "annual-new", target: "annual-continue", advanceOnClick: true },
    { id: "details", page: "annual-edit", target: "annual-details" },
    { id: "next", page: "annual-edit", target: "annual-next", advanceOnClick: true },
    { id: "items", page: "annual-edit", target: "annual-items" },
    { id: "summary", page: "annual-edit", target: "annual-summary" },
    { id: "preview", page: "annual-edit", target: "annual-preview", advanceOnClick: true },
    { id: "submit", page: "annual-edit", target: "annual-submit" },
  ],
  expense: [
    { id: "type", page: "expense-new", target: "expense-type" },
    { id: "department", page: "expense-new", target: "expense-department" },
    { id: "continue", page: "expense-new", target: "expense-continue", advanceOnClick: true },
    { id: "budget", page: "expense-edit", target: "expense-budget" },
    { id: "question", page: "expense-edit", target: "expense-question" },
    { id: "next", page: "expense-edit", target: "expense-next", advanceOnClick: true },
    {
      id: "tax",
      page: "expense-edit",
      target: "expense-tax",
      onlyForType: "purchase_request",
    },
    { id: "send", page: "expense-edit", target: "expense-send" },
  ],
};

export function isTourId(value: unknown): value is TourId {
  return typeof value === "string" && (TOUR_IDS as readonly string[]).includes(value);
}

export function onPage(page: TourPage, pathname: string): boolean {
  return PAGE_PATTERNS[page].test(pathname);
}

/** The tour whose first page this is, for the "Show me how" link on that page. */
export function firstStepOn(tour: TourId, pathname: string): number {
  const i = TOURS[tour].findIndex((s) => onPage(s.page, pathname));
  return i === -1 ? 0 : i;
}

/**
 * The nearest step from `from` in `direction` that applies to this form, given the
 * expense type the page shows (null: not known on this page). Off the ends: -1 or length.
 */
export function applicableStep(
  tour: TourId,
  from: number,
  direction: 1 | -1,
  formType: string | null,
): number {
  const steps = TOURS[tour];
  let i = from;
  while (i >= 0 && i < steps.length) {
    const only = steps[i]!.onlyForType;
    if (!only || formType === null || formType === only) return i;
    i += direction;
  }
  return i;
}

/**
 * Where a tour should be after the person lands on `pathname`: a step on a later page
 * when they've moved on by themselves (the form took them there), otherwise where it was.
 */
export function catchUp(tour: TourId, step: number, pathname: string): number {
  const steps = TOURS[tour];
  const current = steps[step];
  if (!current || onPage(current.page, pathname)) return step;
  const later = steps.findIndex((s, i) => i > step && onPage(s.page, pathname));
  return later === -1 ? step : later;
}
