import { cn } from "@/lib/cn";

/** Shared control styles (DRD 10): one look for buttons and inputs everywhere. */

export type ButtonTone = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-10";

const tones: Record<ButtonTone, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-fg hover:bg-surface-hover",
  // Destructive actions are never styled as the ordinary primary action (DRD 7.4).
  danger: "border border-danger bg-surface text-danger hover:bg-surface-hover",
  ghost: "text-fg hover:bg-surface-hover",
};

export function buttonClass(tone: ButtonTone = "primary", className?: string): string {
  return cn(base, tones[tone], className);
}

export const inputClass =
  "block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted aria-[invalid=true]:border-danger lg:min-h-10";

export const textareaClass = cn(inputClass, "min-h-28 py-2");

export const cardClass = "rounded-card border border-border bg-surface p-5 shadow-card sm:p-6";

export const linkClass = "font-medium text-accent underline-offset-4 hover:underline";
