"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Compass, PlayCircle } from "lucide-react";
import { recordTourAction } from "@/app/actions/tours";
import { buttonClass } from "@/components/ui/styles";
import { toursCopy } from "@/copy/tours";
import { firstStepOn, onPage, PAGE_HREF, TOURS, type TourId } from "@/domain/tours/tours";
import { cn } from "@/lib/cn";
import { getTour, startTour, subscribeTour } from "./store";

const t = toursCopy;

/** Starts a tour from its first step, opening that step's page if this isn't it. */
function useStartTour() {
  const router = useRouter();
  const pathname = usePathname();
  return (tour: TourId) => {
    const first = TOURS[tour][0]!;
    if (onPage(first.page, pathname)) {
      startTour(tour, firstStepOn(tour, pathname));
    } else {
      startTour(tour, 0);
      router.push(PAGE_HREF[first.page]);
    }
  };
}

function useActiveTour() {
  return useSyncExternalStore(subscribeTour, getTour, () => null);
}

/**
 * "New here?": offered once, until the person finishes the tour or chooses Not now
 * (remembered on the server). Hidden while that tour is running.
 */
export function TourOffer({ tour }: { tour: TourId }) {
  const start = useStartTour();
  const active = useActiveTour();
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();
  if (hidden || active?.tour === tour) return null;
  const headingId = `tour-offer-${tour}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-card border border-accent/40 bg-accent-soft p-5 sm:flex-row sm:items-center sm:p-6"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-accent">
        <Compass className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-semibold tracking-wide text-accent uppercase">
          {t.offer.eyebrow}
        </p>
        <h2 id={headingId} className="text-lg font-semibold">
          {t.offer.title[tour]}
        </h2>
        <p className="text-sm text-fg-muted">{t.offer.body[tour]}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => start(tour)} className={buttonClass("primary")}>
          <PlayCircle className="size-4" aria-hidden="true" />
          {t.offer.start}
        </button>
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            startTransition(async () => {
              await recordTourAction({ tour, outcome: "dismissed" });
            });
          }}
          className={buttonClass("ghost")}
        >
          {t.offer.later}
        </button>
      </div>
    </section>
  );
}

/** "Show me how" beside a form's heading: starts the tour at this page's first step. */
export function ShowMeHow({ tour, className }: { tour: TourId; className?: string }) {
  const start = useStartTour();
  return (
    <button
      type="button"
      onClick={() => start(tour)}
      className={buttonClass("secondary", className)}
    >
      <Compass className="size-4" aria-hidden="true" />
      {t.showMeHow}
    </button>
  );
}

/** Help → Guided tours: one button per tour the person may take. */
export function TourStartButton({ tour, again }: { tour: TourId; again: boolean }) {
  const start = useStartTour();
  return (
    <button
      type="button"
      onClick={() => start(tour)}
      className={cn(buttonClass(again ? "secondary" : "primary"), "shrink-0")}
    >
      <PlayCircle className="size-4" aria-hidden="true" />
      {again ? t.help.again : t.help.start}
    </button>
  );
}
