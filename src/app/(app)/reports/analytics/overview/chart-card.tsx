import { IconChip, type Tone } from "@/components/ui/display";
import { cardClass } from "@/components/ui/styles";
import type { LucideIcon } from "lucide-react";
import { activityCopy } from "@/copy/activity";
import { cn } from "@/lib/cn";

const o = activityCopy.overview;

export const th = "py-2 pr-4 text-left text-xs font-semibold tracking-wide text-fg-muted uppercase";
export const td = "py-2 pr-4 align-top";

/** A chart card: the takeaway as its title, the chart, then the same figures as a table. */
export function ChartCard({
  id,
  title,
  icon,
  tone,
  children,
  table,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  tone: Tone;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={cn(cardClass, "space-y-5")}>
      <div className="flex items-center gap-3">
        <IconChip icon={icon} tone={tone} />
        <h2 id={`${id}-heading`} className="text-[17px] leading-tight font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      {children}
      <details className="rounded-control border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium lg:min-h-9">
          {o.asTable}
        </summary>
        <div className="overflow-x-auto border-t border-border p-3">{table}</div>
      </details>
    </section>
  );
}
