/**
 * Colour tones for cards, section headers and number tiles, so each card on a page is
 * easy to tell apart at a glance. Every tone is a strong colour on its own soft tint,
 * from the area tokens in globals.css (each pair is checked at 4.5:1 or more by
 * tests/unit/area-colours.test.ts) or the status tokens. Colour is never the only cue:
 * each tinted chip carries an icon, and the card still has its title.
 * Literal class names, because Tailwind only generates classes it can read.
 */

export type Tone = "violet" | "blue" | "teal" | "amber" | "pink" | "slate" | "green" | "red";

export const TONE: Record<Tone, { chip: string; text: string; bar: string; soft: string }> = {
  violet: {
    chip: "bg-area-home-soft text-area-home",
    text: "text-area-home",
    bar: "bg-area-home",
    soft: "bg-area-home-soft",
  },
  blue: {
    chip: "bg-area-annual-soft text-area-annual",
    text: "text-area-annual",
    bar: "bg-area-annual",
    soft: "bg-area-annual-soft",
  },
  teal: {
    chip: "bg-area-expenses-soft text-area-expenses",
    text: "text-area-expenses",
    bar: "bg-area-expenses",
    soft: "bg-area-expenses-soft",
  },
  amber: {
    chip: "bg-area-spending-soft text-area-spending",
    text: "text-area-spending",
    bar: "bg-area-spending",
    soft: "bg-area-spending-soft",
  },
  pink: {
    chip: "bg-area-reports-soft text-area-reports",
    text: "text-area-reports",
    bar: "bg-area-reports",
    soft: "bg-area-reports-soft",
  },
  slate: {
    chip: "bg-area-admin-soft text-area-admin",
    text: "text-area-admin",
    bar: "bg-area-admin",
    soft: "bg-area-admin-soft",
  },
  green: {
    chip: "bg-success/10 text-success",
    text: "text-success",
    bar: "bg-success",
    soft: "bg-success/10",
  },
  red: {
    chip: "bg-danger/10 text-danger",
    text: "text-danger",
    bar: "bg-danger",
    soft: "bg-danger/10",
  },
};
