import Link from "next/link";
import { ArrowLeft, Inbox, ShieldAlert, type LucideIcon } from "lucide-react";
import { adminCopy } from "@/copy/admin";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { cardClass, interactiveCardClass } from "./styles";
import { TONE, type Tone } from "./tone";

export type { Tone } from "./tone";

/** Status badge (DRD 7.2): readable text, semantic tone, never pulsing. */
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-border-strong text-fg-muted",
  info: "border-info text-info",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-surface px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  intro,
  back,
  children,
}: {
  title: string;
  intro?: string;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {back && (
        <Link
          href={back.href}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-muted hover:text-fg lg:min-h-9"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {adminCopy.common.back(back.label)}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] leading-tight font-bold tracking-tight">{title}</h1>
        {children}
      </div>
      {intro && <p className="max-w-3xl text-[15px] text-fg-muted">{intro}</p>}
    </div>
  );
}

/** An icon in a rounded tile of a tone's colour: how each card shows what it's about. */
export function IconChip({
  icon: Icon,
  tone,
  size = "md",
}: {
  icon: LucideIcon;
  tone: Tone;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-[10px]",
        TONE[tone].chip,
        size === "md" ? "size-10" : "size-8",
      )}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} />
    </span>
  );
}

/**
 * A card with a heading. With `icon` and `tone`, the heading leads with a coloured icon
 * tile, so the cards on one page are easy to tell apart (DRD 3.2 area colours).
 */
export function Section({
  title,
  description,
  children,
  id,
  icon,
  tone = "slate",
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** Shown at the right of the heading, such as a link or a count. */
  actions?: React.ReactNode;
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(cardClass, "scroll-mt-20 space-y-5")}
      id={id}
    >
      <div className="flex flex-wrap items-center gap-3">
        {icon && <IconChip icon={icon} tone={tone} />}
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id={headingId} className="text-[17px] leading-tight font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A headline number (DRD 6.13 "headline cards"): a label, the figure, an optional line
 * beneath, and a coloured icon tile. `emphasis` rings it, for "this needs you".
 */
export function StatCard({
  label,
  value,
  icon,
  tone,
  children,
  emphasis = false,
  href,
  current = false,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone: Tone;
  children?: React.ReactNode;
  emphasis?: boolean;
  href?: string;
  /** The filter this tile links to is the one showing. */
  current?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-fg-muted">{label}</p>
        <IconChip icon={icon} tone={tone} size="sm" />
      </div>
      <p className="text-[28px] leading-none font-semibold tracking-tight tabular">{value}</p>
      {children && <div className="text-sm text-fg-muted">{children}</div>}
    </>
  );
  const className = cn(
    cardClass,
    "flex flex-col gap-3 p-5 sm:p-5",
    (emphasis || current) && "ring-2 ring-accent ring-offset-0",
    href && interactiveCardClass,
  );
  return href ? (
    <Link href={href} className={className} aria-current={current ? "true" : undefined}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-surface-2 p-4 text-sm text-fg-muted">
      <Inbox className="size-5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

/** DRD 11 permission-denied state: no data, a plain explanation. */
export function PermissionDenied({ body = adminCopy.denied.body }: { body?: string }) {
  return (
    <div className={cn(cardClass, "flex items-start gap-3")}>
      <ShieldAlert className="mt-1 size-6 shrink-0 text-warning" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{adminCopy.denied.title}</h1>
        <p className="text-sm text-fg-muted">{body}</p>
      </div>
    </div>
  );
}

/** Loading skeleton for an admin page body. */
export function AdminSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only" role="status">
        {copy.app.loading}
      </span>
      <div className="h-24 animate-pulse rounded-card bg-surface-2 motion-reduce:animate-none" />
      <div className="h-64 animate-pulse rounded-card bg-surface-2 motion-reduce:animate-none" />
    </div>
  );
}
