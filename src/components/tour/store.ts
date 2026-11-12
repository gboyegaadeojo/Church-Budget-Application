"use client";

import { isTourId, TOURS, type TourId } from "@/domain/tours/tours";

/**
 * The tour in progress in this tab: which tour and which step. Kept in sessionStorage so
 * it survives the form moving to its next page or a reload; where the person stands in a
 * tour is a convenience, not a record (the server remembers only finished or put aside).
 */
export type ActiveTour = {
  tour: TourId;
  step: number;
  /** Move focus to the card (the person moved the tour on themselves). */
  focus: boolean;
};

const KEY = "guided-tour";
let state: ActiveTour | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const kept = JSON.parse(raw) as { tour?: unknown; step?: unknown };
    if (
      isTourId(kept.tour) &&
      typeof kept.step === "number" &&
      kept.step >= 0 &&
      kept.step < TOURS[kept.tour].length
    ) {
      state = { tour: kept.tour, step: kept.step, focus: false };
    }
  } catch {
    // Storage may be unavailable (a private window); the tour then lasts until a reload.
  }
}

function save() {
  try {
    if (state) sessionStorage.setItem(KEY, JSON.stringify({ tour: state.tour, step: state.step }));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Ignore: see load().
  }
}

export function setTour(next: ActiveTour | null) {
  state = next;
  save();
  for (const listener of listeners) listener();
}

export function getTour(): ActiveTour | null {
  load();
  return state;
}

export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts a tour at `step` (its first step by default), with focus on the card. */
export function startTour(tour: TourId, step = 0) {
  setTour({ tour, step, focus: true });
}
