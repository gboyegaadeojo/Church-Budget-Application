"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { recordTourAction } from "@/app/actions/tours";
import { buttonClass } from "@/components/ui/styles";
import { toursCopy } from "@/copy/tours";
import {
  applicableStep,
  catchUp,
  onPage,
  PAGE_HREF,
  TOURS,
  type TourId,
  type TourOutcome,
} from "@/domain/tours/tours";
import { cn } from "@/lib/cn";
import { getTour, setTour, subscribeTour } from "./store";

const t = toursCopy;
/** Below this width the card docks to the top or bottom of the screen like a sheet. */
const NARROW = 640;
const CARD_WIDTH = 340;
const GAP = 14;
const EDGE = 16;
/** How long to wait for the next page after a step's button took the person there. */
const PAGE_GRACE_MS = 1500;

type Box = { top: number; left: number; width: number; height: number };
type View = { box: Box | null; vw: number; vh: number; formType: string | null; modal: boolean };

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5);

/** The first copy of the part that is actually on screen (a form may have a phone and a desktop copy). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

function remember(tour: TourId, outcome: TourOutcome) {
  void recordTourAction({ tour, outcome }).catch(() => {
    // Not remembered: the first-time offer may show again, which does no harm.
  });
}

/**
 * The guided tour in progress (decided 2026-11-12): a ring around one part of the real
 * page and a card that says what to do there. It never blocks the page: the person
 * fills in the form as usual, and pressing a lit-up button moves the tour on.
 * Mounted once in the app layout; tours start from the offer card, Help or Show me how.
 */
export function TourHost() {
  const active = useSyncExternalStore(subscribeTour, getTour, () => null);
  const pathname = usePathname();
  const [view, setView] = useState<View>({
    box: null,
    vw: 1024,
    vh: 768,
    formType: null,
    modal: false,
  });
  const [cardHeight, setCardHeight] = useState(180);
  /** The off-page step whose wait is over (see PAGE_GRACE_MS). */
  const [offPageReady, setOffPageReady] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const direction = useRef<1 | -1>(1);
  const scrolledFor = useRef<string | null>(null);
  const ids = useId();

  const step = active ? TOURS[active.tour][active.step] : undefined;
  const here = !!step && onPage(step.page, pathname);

  // The form moved the person on (Continue opened the editor): follow them.
  useEffect(() => {
    if (!active) return;
    const caught = catchUp(active.tour, active.step, pathname);
    if (caught !== active.step) setTour({ ...active, step: caught, focus: false });
  }, [active, pathname]);

  // Watch the page: where the lit-up part is, the form's type, and any open dialog.
  useEffect(() => {
    if (!active || !step) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = here ? findTarget(step.target) : null;
      targetRef.current = el;
      const r = el?.getBoundingClientRect();
      const box = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      const next: View = {
        box,
        vw: window.innerWidth,
        vh: window.innerHeight,
        formType:
          document.querySelector("[data-tour-type]")?.getAttribute("data-tour-type") ?? null,
        modal: !!document.querySelector('[role="alertdialog"], [role="dialog"][aria-modal="true"]'),
      };
      setView((prev) =>
        sameBox(prev.box, next.box) &&
        prev.vw === next.vw &&
        prev.vh === next.vh &&
        prev.formType === next.formType &&
        prev.modal === next.modal
          ? prev
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "open", "data-tour-type", "data-state"],
    });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active, step, here]);

  const finish = useCallback(() => {
    if (!active) return;
    remember(active.tour, "finished");
    setTour(null);
    setFinished(true);
  }, [active]);

  const end = useCallback(() => {
    if (!active) return;
    remember(active.tour, "dismissed");
    setTour(null);
  }, [active]);

  const go = useCallback(
    (dir: 1 | -1, focus: boolean) => {
      if (!active) return;
      direction.current = dir;
      const next = applicableStep(active.tour, active.step + dir, dir, view.formType);
      if (next >= TOURS[active.tour].length) finish();
      else if (next >= 0) setTour({ tour: active.tour, step: next, focus });
    },
    [active, view.formType, finish],
  );

  // Skip a step that doesn't apply to this form (no sales tax switch on a claim).
  useEffect(() => {
    if (!active || !here) return;
    const next = applicableStep(active.tour, active.step, direction.current, view.formType);
    if (next === active.step) return;
    if (next >= TOURS[active.tour].length) finish();
    else setTour({ ...active, step: Math.max(next, 0) });
  }, [active, here, view.formType, finish]);

  // Bring the lit-up part into view once per step.
  useEffect(() => {
    if (!active || !targetRef.current || !view.box) return;
    const key = `${active.tour}:${active.step}`;
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    targetRef.current.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [active, view.box]);

  // Move focus to the card when the person moved the tour on themselves. Started from
  // another page, the card only appears once that page has loaded, so focus waits for it.
  const focusFor = useRef<string | null>(null);
  useEffect(() => {
    focusFor.current = active?.focus ? `${active.tour}:${active.step}` : null;
  }, [active]);
  useEffect(() => {
    if (!focusFor.current || !titleRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!titleRef.current) return;
      titleRef.current.focus({ preventScroll: true });
      focusFor.current = null;
    });
    return () => cancelAnimationFrame(frame);
  });

  // Pressing the lit-up button is the step's action, so the tour moves on with it.
  useEffect(() => {
    if (!step?.advanceOnClick) return;
    const onClick = (e: MouseEvent) => {
      if (targetRef.current?.contains(e.target as Node)) setTimeout(() => go(1, false), 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, go]);

  // Esc ends the tour, unless a menu or dialog of the page is using it.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const focused = document.activeElement;
      if (focused === document.body || cardRef.current?.contains(focused)) end();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, end]);

  // On another page, wait a moment: the form may be taking the person there.
  const offPage = active && !here ? `${active.tour}:${active.step}:${pathname}` : null;
  useEffect(() => {
    if (!offPage) return;
    const timer = setTimeout(() => setOffPageReady(offPage), PAGE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [offPage]);

  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(() => setFinished(false), 8000);
    return () => clearTimeout(timer);
  }, [finished]);

  // The card's height decides whether it fits above or below the lit-up part.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCardHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, here, view.modal, offPageReady]);

  if (finished && !active) {
    return createPortal(
      <div
        role="status"
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 z-(--z-toast) flex items-start gap-3 rounded-card border border-border bg-surface p-4 text-sm shadow-overlay sm:left-auto sm:w-[22rem] md:bottom-6"
      >
        <p className="flex-1">{t.finishedNote}</p>
        <button
          type="button"
          onClick={() => setFinished(false)}
          aria-label={t.end}
          className="-m-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>,
      document.body,
    );
  }

  if (!active || !step || view.modal || (!here && offPageReady !== offPage)) return null;

  const words = (
    t.steps[active.tour] as Record<string, { title: string; body: string; waiting?: string }>
  )[step.id];
  if (!words) return null;
  const box = here ? view.box : null;
  const body = here && !box && words.waiting ? words.waiting : words.body;

  // Number the steps that apply to this form.
  const shown = TOURS[active.tour]
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.onlyForType || view.formType === null || view.formType === s.onlyForType);
  const position = shown.findIndex(({ i }) => i === active.step) + 1;
  const last = position === shown.length;

  const placement = place(box, view.vw, view.vh, cardHeight);

  return createPortal(
    <>
      {box && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-(--z-overlay) rounded-[14px] transition-[top,left,width,height] duration-fast motion-reduce:transition-none"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: "0 0 0 3px var(--accent), 0 0 0 9999px rgb(10 8 24 / 0.38)",
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={t.dialogLabel(t.names[active.tour])}
        aria-describedby={`${ids}-body`}
        className={cn(
          "fixed z-(--z-toast) space-y-3 rounded-card border border-border bg-surface p-4 text-fg shadow-overlay transition-[top,left] duration-fast motion-reduce:transition-none",
          placement.narrow ? "left-3 right-3" : "w-[21.25rem]",
        )}
        style={placement.style}
      >
        <div className="flex items-start gap-3">
          <p className="flex-1 text-xs font-semibold text-accent">
            {t.names[active.tour]} · {t.stepOf(position, shown.length)}
          </p>
          <button
            type="button"
            onClick={end}
            aria-label={t.end}
            title={t.end}
            className="-m-1.5 grid size-9 shrink-0 cursor-pointer place-items-center rounded-control text-fg-muted transition-colors duration-fast hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <h2 ref={titleRef} tabIndex={-1} className="text-base font-semibold outline-none">
          {words.title}
        </h2>
        <p id={`${ids}-body`} className="text-sm leading-relaxed text-fg-muted">
          {body}
        </p>
        {!here && (
          <Link href={PAGE_HREF[step.page]} className={buttonClass("secondary", "w-full")}>
            {t.takeMeThere}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex gap-1" aria-hidden="true">
            {shown.map(({ i }) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-[width] duration-fast motion-reduce:transition-none",
                  i === active.step ? "w-4 bg-accent" : "w-1.5 bg-border",
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {position > 1 && (
              <button type="button" onClick={() => go(-1, true)} className={buttonClass("ghost")}>
                {t.back}
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : go(1, true))}
              className={buttonClass("primary")}
            >
              {last ? t.finish : t.next}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * Where the card goes. Phones: a sheet at the bottom, or at the top when the lit-up part
 * is low on the screen. Wider: below the part, else above it, else beside it, else in the
 * bottom corner (no part, or one taller than the screen).
 */
function place(
  box: Box | null,
  vw: number,
  vh: number,
  h: number,
): { narrow: boolean; style: React.CSSProperties } {
  if (vw < NARROW) {
    const low = box !== null && box.top + box.height / 2 > vh * 0.5;
    return {
      narrow: true,
      style: low
        ? { top: "calc(4.5rem + env(safe-area-inset-top, 0px))" }
        : { bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))" },
    };
  }
  const corner = { narrow: false, style: { right: 24, bottom: 24 } };
  if (!box) return corner;
  const left = Math.min(Math.max(box.left, EDGE), vw - CARD_WIDTH - EDGE);
  const below = box.top + box.height + GAP;
  if (below + h <= vh - EDGE) return { narrow: false, style: { top: below, left } };
  const above = box.top - GAP - h;
  if (above >= EDGE) return { narrow: false, style: { top: above, left } };
  const beside = box.left + box.width + GAP;
  if (beside + CARD_WIDTH <= vw - EDGE) {
    return {
      narrow: false,
      style: { top: Math.min(Math.max(box.top, EDGE), vh - h - EDGE), left: beside },
    };
  }
  return corner;
}
