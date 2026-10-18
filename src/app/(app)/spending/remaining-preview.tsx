"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { spendingCopy } from "@/copy/spending";
import { cn } from "@/lib/cn";
import { formatCAD, parseCAD, sumCents } from "@/lib/money";

const r = spendingCopy.record;

/**
 * "Remaining: $19,100.00 → $14,100.00" as the amount is typed (DRD 6.8). An expense
 * lowers Remaining, a refund raises it; below zero it reads "Over budget by $X" with an
 * icon, never colour alone. A preview only: the server recalculates on save and asks for
 * the overspend note itself.
 */
export function RemainingPreview({ remainingCents }: { remainingCents: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [refund, setRefund] = useState(false);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const read = () => {
      const data = new FormData(form);
      const cents = parseCAD(String(data.get("amount") ?? ""));
      setAmount(cents !== null && cents > 0 ? cents : null);
      setRefund(data.get("entryType") === "refund");
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    // After a save the form is cleared; read it once the reset has happened.
    const onReset = () => setTimeout(read);
    form.addEventListener("reset", onReset);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
      form.removeEventListener("reset", onReset);
    };
  }, []);

  const after = amount === null ? null : sumCents([remainingCents, refund ? amount : -amount]);
  const show = (cents: number) => (cents < 0 ? r.overBy(formatCAD(-cents)) : formatCAD(cents));

  return (
    <p
      ref={ref}
      aria-live="polite"
      className="flex flex-wrap items-center gap-2 rounded-control bg-surface-2 px-3 py-2 text-sm"
    >
      <span className="text-fg-muted">{r.remainingLabel}</span>
      <span className="tabular font-semibold">{show(remainingCents)}</span>
      {after !== null && (
        <>
          <ArrowRight className="size-4 text-fg-muted" aria-hidden="true" />
          <span className="sr-only">{r.becomes}</span>
          <span
            className={cn(
              "tabular inline-flex items-center gap-1 font-semibold",
              after < 0 && "text-danger",
            )}
          >
            {after < 0 && <AlertTriangle className="size-4" aria-hidden="true" />}
            {show(after)}
          </span>
        </>
      )}
    </p>
  );
}
