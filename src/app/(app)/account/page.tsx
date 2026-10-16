import { Suspense } from "react";
import type { Metadata } from "next";
import { Plane } from "lucide-react";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AdminSkeleton, Badge, PageHeader } from "@/components/ui/display";
import { cardClass } from "@/components/ui/styles";
import { accountCopy } from "@/copy/account";
import { getDb } from "@/db";
import { accountantCover } from "@/domain/notifications/recipients";
import { getChurchTimeZone } from "@/domain/settings";
import { getMyAway } from "@/domain/users/away";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { formatDate, zonedDate } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { clearAwayAction, setAwayAction } from "./actions";

const c = accountCopy;
const t = c.away;

export const metadata: Metadata = { title: c.title };

/** Account settings (DRD 6.11b). Theme is in the account menu; Away is here (FR-33). */
export default function AccountPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <AccountContent />
      </Suspense>
    </div>
  );
}

async function AccountContent() {
  const viewer = await getViewer();
  const canBeAway = authorize(viewer, "account.away").allowed;
  return (
    <>
      <PageHeader title={c.title} intro={c.intro} />
      {canBeAway ? (
        <AwaySection userId={viewer.id} />
      ) : (
        <p className={cn(cardClass, "text-sm text-fg-muted")}>{t.notForYou}</p>
      )}
    </>
  );
}

async function AwaySection({ userId }: { userId: string }) {
  const db = getDb();
  const now = new Date();
  const [away, zone] = await Promise.all([getMyAway(db, userId, now), getChurchTimeZone(db)]);
  const day = (d: Date) => formatDate(zonedDate(d, zone));
  const dayValue = (d: Date | null) => (d ? zonedDate(d, zone) : "");
  // Who would cover: everyone else with an approver role who isn't away themselves.
  const cover = await accountantCover(db, now);
  // Only the Primary accountant's Away moves emails (or anyone's, when no Primary is chosen).
  const routesMyEmails = !cover.primary || cover.primary.userId === userId;
  const others = cover.recipients.filter((r) => r.userId !== userId);
  const set = away.from !== null;
  const status = away.active
    ? t.now(away.until ? day(away.until) : null)
    : set && away.from && away.from > now
      ? t.planned(day(away.from), away.until ? day(away.until) : null)
      : t.notAway;

  return (
    <section
      id="away"
      aria-labelledby="away-heading"
      className={cn(cardClass, "scroll-mt-20 space-y-5", away.active && "border-warning")}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-control",
            away.active ? "bg-warning/15 text-warning" : "bg-surface-2 text-fg-muted",
          )}
        >
          <Plane className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="away-heading" className="text-lg font-semibold">
              {t.heading}
            </h2>
            {away.active && <Badge tone="warning">{t.heading}</Badge>}
          </div>
          <p className="text-sm text-fg-muted">{t.intro}</p>
          <p className="text-sm font-medium" role="status">
            {status}
          </p>
          {away.active &&
            routesMyEmails &&
            (others.length > 0 ? (
              <p className="text-sm">{t.covering(others.map((o) => o.name).join(", "))}</p>
            ) : (
              <p className="text-sm text-warning">{t.noCover}</p>
            ))}
        </div>
      </div>

      <ActionForm action={setAwayAction} aria-label={t.heading}>
        <input type="hidden" name="version" value={away.version} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="from"
            type="date"
            label={t.from}
            hint={t.fromHint}
            defaultValue={dayValue(away.from) || zonedDate(now, zone)}
            required
          />
          <TextField
            name="until"
            type="date"
            label={t.until}
            hint={t.untilHint}
            defaultValue={dayValue(away.until)}
          />
        </div>
        <SubmitButton tone={set ? "secondary" : "primary"}>{set ? t.update : t.save}</SubmitButton>
      </ActionForm>

      {set && (
        <ActionForm action={clearAwayAction} id="away-off-form" aria-label={t.off}>
          <input type="hidden" name="version" value={away.version} />
          <ConfirmDialog
            formId="away-off-form"
            trigger={t.off}
            title={t.offTitle}
            body={t.offBody}
            confirmLabel={t.off}
          />
        </ActionForm>
      )}
    </section>
  );
}
