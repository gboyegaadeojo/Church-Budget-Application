import { Check } from "lucide-react";
import { annualCopy } from "@/copy/annual";
import { cn } from "@/lib/cn";

const f = annualCopy.form;

/** Where the person is in the three steps (DRD 6.3 "progress indicator"). */
export function StepIndicator({ current }: { current: 0 | 1 | 2 }) {
  return (
    <nav aria-label={f.progress}>
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {f.steps.map((label, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <li
              key={label}
              aria-current={here ? "step" : undefined}
              className={cn(
                "flex items-center gap-2",
                here ? "font-semibold text-fg" : "text-fg-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-xs",
                  done && "border-accent bg-accent text-on-accent",
                  here && "border-accent text-accent",
                  !done && !here && "border-border-strong",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span>
                <span className="sr-only">{f.stepOf(i + 1, "")}</span>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
