import { getDb } from "@/db";
import { expenseStartOptions } from "@/domain/expenses/queries";
import { myTours } from "@/domain/tours/service";
import type { TourId } from "@/domain/tours/tours";
import type { Viewer } from "@/lib/roles";
import { ShowMeHow, TourOffer } from "./tour-start";

/**
 * Home's first-time offer: the annual budget tour first; once that's answered, the new
 * expense tour, as soon as one of the person's departments has a budget to spend.
 */
export async function HomeTourOffer({ viewer }: { viewer: Viewer }) {
  const db = getDb();
  const states = await myTours(db, viewer);
  const open = (tour: TourId) => states.some((s) => s.tour === tour && s.outcome === null);
  if (open("annual")) return <TourOffer tour="annual" />;
  if (!open("expense")) return null;
  const options = await expenseStartOptions(db, viewer);
  return options.some((d) => d.cycles.length > 0) ? <TourOffer tour="expense" /> : null;
}

/**
 * A form's first page: the offer the first time, then Show me how beside the heading.
 * Nothing for someone who may not take the tour.
 */
export async function formTour(viewer: Viewer, tour: TourId) {
  const state = (await myTours(getDb(), viewer)).find((s) => s.tour === tour);
  return {
    offer: state && state.outcome === null ? <TourOffer tour={tour} /> : null,
    showMeHow: state && state.outcome !== null ? <ShowMeHow tour={tour} /> : null,
  };
}
