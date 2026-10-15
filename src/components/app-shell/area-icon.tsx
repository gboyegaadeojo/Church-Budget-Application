import {
  CalendarRange,
  FileSpreadsheet,
  House,
  Receipt,
  Settings,
  Wallet,
  type LucideProps,
} from "lucide-react";
import type { AreaId } from "@/domain/navigation";
import { cn } from "@/lib/cn";

const ICONS = {
  home: House,
  annual: CalendarRange,
  expenses: Receipt,
  spending: Wallet,
  reports: FileSpreadsheet,
  admin: Settings,
} as const;

export function AreaIcon({ area, ...props }: { area: AreaId } & LucideProps) {
  const Icon = ICONS[area];
  return <Icon aria-hidden="true" {...props} />;
}

/**
 * Each area's colour as literal class names (Tailwind only generates classes it can
 * read in the source). Tokens live in globals.css: --area-{id} and --area-{id}-soft.
 */
export const AREA_STYLE: Record<
  AreaId,
  { text: string; soft: string; bar: string; ring: string; panel: string }
> = {
  home: {
    text: "text-area-home",
    soft: "bg-area-home-soft",
    bar: "bg-area-home",
    ring: "border-area-home",
    panel: "bg-area-home-soft/45",
  },
  annual: {
    text: "text-area-annual",
    soft: "bg-area-annual-soft",
    bar: "bg-area-annual",
    ring: "border-area-annual",
    panel: "bg-area-annual-soft/45",
  },
  expenses: {
    text: "text-area-expenses",
    soft: "bg-area-expenses-soft",
    bar: "bg-area-expenses",
    ring: "border-area-expenses",
    panel: "bg-area-expenses-soft/45",
  },
  spending: {
    text: "text-area-spending",
    soft: "bg-area-spending-soft",
    bar: "bg-area-spending",
    ring: "border-area-spending",
    panel: "bg-area-spending-soft/45",
  },
  reports: {
    text: "text-area-reports",
    soft: "bg-area-reports-soft",
    bar: "bg-area-reports",
    ring: "border-area-reports",
    panel: "bg-area-reports-soft/45",
  },
  admin: {
    text: "text-area-admin",
    soft: "bg-area-admin-soft",
    bar: "bg-area-admin",
    ring: "border-area-admin",
    panel: "bg-area-admin-soft/45",
  },
};

/** The area's icon in a rounded tile of its colour; grows a little when its row is hovered. */
export function AreaBadge({
  area,
  size = "md",
  className,
}: {
  area: AreaId;
  size?: "sm" | "md";
  className?: string;
}) {
  const s = AREA_STYLE[area];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-control transition-transform duration-fast ease-standard group-hover:scale-110",
        s.soft,
        s.text,
        size === "md" ? "size-8" : "size-7",
        className,
      )}
    >
      <AreaIcon area={area} className={size === "md" ? "size-[18px]" : "size-4"} />
    </span>
  );
}
