import Link from "next/link";
import { ArrowLeft, Inbox, ShieldAlert } from "lucide-react";
import { adminCopy } from "@/copy/admin";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { cardClass } from "./styles";

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
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
      {intro && <p className="max-w-3xl text-fg-muted">{intro}</p>}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`;
  return (
    <section aria-labelledby={headingId} className={cn(cardClass, "space-y-4")}>
      <div className="space-y-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-control border border-dashed border-border-strong p-5 text-sm text-fg-muted">
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
