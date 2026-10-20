import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * The building blocks of Settings, after a phone's or computer's settings: short groups
 * of slim rows, each showing its current value on the right. A row opens in place to
 * change it, so the page reads at a glance and only one thing is edited at a time.
 * Plain components, usable from server and client files alike.
 */

const rowPadding = "px-4 py-3";

/** A titled group of rows, with an optional note underneath. A region named by its title. */
export function SettingsGroup({
  title,
  id,
  footer,
  actions,
  children,
}: {
  title: string;
  id: string;
  footer?: React.ReactNode;
  /** At the right of the title, such as a count. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId} id={id} className="scroll-mt-20">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h3 id={headingId} className="text-sm font-semibold text-fg">
          {title}
        </h3>
        {actions && <div className="shrink-0 text-xs text-fg-muted">{actions}</div>}
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-surface text-sm">
        {children}
      </div>
      {footer && <div className="mt-2 px-1 text-xs leading-relaxed text-fg-muted">{footer}</div>}
    </section>
  );
}

/** A row with a label on the left and its value or a control on the right. */
export function SettingsRow({
  label,
  description,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1", rowPadding)}>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-fg">{label}</div>
        {description && <div className="text-xs text-fg-muted">{description}</div>}
      </div>
      {children !== undefined && (
        <div className="flex min-w-0 items-center gap-2 text-fg-muted">{children}</div>
      )}
    </div>
  );
}

/** A plain block inside a group, for a form field or a list. */
export function SettingsCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-4 px-4 py-4", className)}>{children}</div>;
}

/** A row that goes to another page. */
export function SettingsLinkRow({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-12 items-center gap-4 transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none",
        rowPadding,
      )}
    >
      <span className="min-w-0 flex-1 font-medium text-fg">{label}</span>
      {value && <span className="min-w-0 truncate text-fg-muted">{value}</span>}
      <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
    </Link>
  );
}

/**
 * A row showing a setting's current value that opens in place to change it. The open
 * state belongs to the browser, so it stays open while a save shows its result.
 */
export function SettingsDisclosure({
  label,
  value,
  children,
  accent = false,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  children: React.ReactNode;
  /** An action row, such as "Add a signer", in the accent colour. */
  accent?: boolean;
}) {
  return (
    <details className="group">
      <summary
        className={cn(
          "flex min-h-12 cursor-pointer list-none items-center gap-4 transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden",
          rowPadding,
        )}
      >
        <span className={cn("min-w-0 flex-1 font-medium", accent ? "text-accent" : "text-fg")}>
          {label}
        </span>
        {value !== undefined && (
          <span className="flex min-w-0 items-center gap-2 text-right text-fg-muted">{value}</span>
        )}
        <ChevronRight
          className="size-4 shrink-0 text-fg-muted transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-4 border-t border-border bg-surface-2/50 px-4 py-4">{children}</div>
    </details>
  );
}
