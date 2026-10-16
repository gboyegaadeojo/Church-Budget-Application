import { Suspense } from "react";
import type { Metadata } from "next";
import { Mail, Plane } from "lucide-react";
import {
  ActionForm,
  CheckboxField,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AdminSkeleton, Badge, PageHeader } from "@/components/ui/display";
import { cardClass } from "@/components/ui/styles";
import { accountCopy } from "@/copy/account";
import { getDb } from "@/db";
import { pendingDigestCount } from "@/domain/notifications/accountant-digest";
import { accountantCover } from "@/domain/notifications/recipients";
import { getChurchTimeZone } from "@/domain/settings";
import { getMyAway } from "@/domain/users/away";
import { getMyEmailPreferences } from "@/domain/users/email-preferences";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { formatDate, zonedDate } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { clearAwayAction, emailPreferencesAction, setAwayAction } from "./actions";

const c = accountCopy;
const t = c.away;

export const metadata: Metadata = { title: c.title };

/**
 * Account settings (DRD 6.11b): email preferences for everyone (FR-21) and Away for
 * approvers (FR-33). The theme is in the account menu.
 */
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
      <EmailSection
        userId={viewer.id}
        accountant={authorize(viewer, "account.accountant_emails").allowed}
      />
      {canBeAway ? (
        <AwaySection userId={viewer.id} />
      ) : (
        <p className={cn(cardClass, "text-sm text-fg-muted")}>{t.notForYou}</p>
      )}
    </>
  );
}

/** Email preferences (FR-21, DRD 6.11b): the optional emails, and what always goes. */
async function EmailSection({ userId, accountant }: { userId: string; accountant: boolean }) {
  const db = getDb();
  const e = c.email;
  const [prefs, waiting] = await Promise.all([
    getMyEmailPreferences(db, userId),
    accountant ? pendingDigestCount(db, userId) : 0,
  ]);
  return (
    <section
      id="email"
      aria-labelledby="email-heading"
      className={cn(cardClass, "scroll-mt-20 space-y-5")}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-2 text-fg-muted"
        >
          <Mail className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="email-heading" className="text-lg font-semibold">
            {e.heading}
          </h2>
          <p className="text-sm text-fg-muted">{e.intro}</p>
        </div>
      </div>

      <ActionForm action={emailPreferencesAction} aria-label={e.heading}>
        <input type="hidden" name="version" value={prefs.version} />
        <div className="space-y-4">
          <CheckboxField
            name="reminders"
            label={e.reminders}
            hint={e.remindersHint}
            defaultChecked={prefs.reminders}
          />
          {accountant && (
            <>
              <CheckboxField
                name="copies"
                label={e.copies}
                hint={e.copiesHint}
                defaultChecked={prefs.copies}
              />
              <div className="max-w-sm">
                <SelectField
                  name="digest"
                  label={e.digest}
                  hint={e.digestHint}
                  defaultValue={prefs.digest}
                  options={[
                    { value: "instant", label: e.instant },
                    { value: "daily", label: e.daily },
                  ]}
                />
              </div>
              {waiting > 0 && <p className="text-sm text-fg-muted">{e.waiting(waiting)}</p>}
            </>
          )}
        </div>
        <SubmitButton tone="secondary">{e.save}</SubmitButton>
      </ActionForm>

      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-medium">{e.alwaysHeading}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
          {e.always.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
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
