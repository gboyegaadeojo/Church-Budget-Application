import { cn } from "@/lib/cn";

/** Shared control styles (DRD 10): one look for buttons and inputs everywhere. */

export type ButtonTone = "primary" | "secondary" | "danger" | "ghost";

// Hover is bold enough to tell what's under the pointer (decided 2026-10-17): colour,
// border and a shadow or press change together, never colour alone.
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-fast active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0 lg:min-h-10";

const tones: Record<ButtonTone, string> = {
  primary: "bg-accent text-on-accent shadow-sm hover:bg-accent-hover hover:shadow-md",
  secondary:
    "border border-border-strong bg-surface text-fg hover:border-accent hover:bg-surface-hover hover:text-accent",
  // Destructive actions are never styled as the ordinary primary action (DRD 7.4).
  danger: "border border-danger bg-surface text-danger hover:bg-danger hover:text-on-accent",
  ghost: "text-fg hover:bg-surface-hover hover:text-accent",
};

export function buttonClass(tone: ButtonTone = "primary", className?: string): string {
  return cn(base, tones[tone], className);
}

export const inputClass =
  "block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted aria-[invalid=true]:border-danger lg:min-h-10";

export const textareaClass = cn(inputClass, "min-h-28 py-2");

export const cardClass = "rounded-card border border-border bg-surface p-5 shadow-card sm:p-6";

/** A card that is itself a link: it lifts and outlines in the accent on hover. */
export const interactiveCardClass =
  "transition-[border-color,box-shadow,transform] duration-fast hover:-translate-y-0.5 hover:border-accent hover:shadow-overlay hover:ring-1 hover:ring-accent motion-reduce:hover:translate-y-0";

/**
 * A link standing on its own (not inside a sentence), at least 24 px tall so it's easy to
 * tap on a phone (WCAG 2.5.8; the Stage 5 phone check).
 */
export const standaloneLinkClass = "inline-flex min-h-6 items-center";

export const linkClass =
  "rounded-[4px] font-medium text-accent underline-offset-4 transition-colors duration-fast hover:bg-accent-soft hover:text-accent-hover hover:underline hover:decoration-2";
