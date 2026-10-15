import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SelectField, SubmitButton } from "@/components/ui/action-form";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { linkClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { getDb } from "@/db";
import { getChurchTimeZone, getSignInSettings, readSettings } from "@/domain/settings";
import { settingVersions } from "@/domain/settings/service";
import { failingRequesters } from "@/domain/users/admin-queries";
import { viewerAllowedTo } from "@/lib/admin-server";
import { taxRateToPercent } from "@/lib/money";
import type { PcoFieldDefinition } from "@/lib/pco";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";
import { timeZoneAction } from "./actions";
import { SignInSettingsForm, TaxRateForm } from "./settings-forms";

const s = adminCopy.settings;

export const metadata: Metadata = { title: s.title };

const SIGN_IN_KEYS = [
  "admin_contact_email",
  "pco_leader_field_name",
  "pco_leader_accepted_values",
  "pco_require_for_requesters",
  "pco_require_for_staff",
  "signin_google_enabled",
  "signin_planning_center_enabled",
] as const;

/** Admin → Settings (DRD 6.11): sales tax, time zone, sign-in and Planning Center (FR-01a, FR-07a). */
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

type Connection = "connected" | "unreachable" | "not_configured";

/** Whether Planning Center answers with the church's token, and its custom fields for the picker. */
async function planningCenterStatus(): Promise<{
  connection: Connection;
  fields: PcoFieldDefinition[] | null;
}> {
  const directory = getPlanningCenterDirectory();
  if (!directory) return { connection: "not_configured", fields: null };
  try {
    await directory.organizationId();
    return { connection: "connected", fields: await directory.listFieldDefinitions() };
  } catch {
    return { connection: "unreachable", fields: null };
  }
}

function timeZoneOptions(current: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
}

async function SettingsContent() {
  const viewer = await viewerAllowedTo("admin.settings", "/admin/settings");
  if (!viewer) return <PermissionDenied />;
  const db = getDb();
  const [
    { sales_tax_rate },
    signIn,
    zone,
    taxVersions,
    zoneVersions,
    signInVersions,
    failing,
    pco,
  ] = await Promise.all([
    readSettings(db, ["sales_tax_rate"]),
    getSignInSettings(db),
    getChurchTimeZone(db),
    settingVersions(db, ["sales_tax_rate"]),
    settingVersions(db, ["church_timezone"]),
    settingVersions(db, SIGN_IN_KEYS),
    failingRequesters(db),
    planningCenterStatus(),
  ]);

  return (
    <>
      <PageHeader title={s.title} />

      <Section title={s.taxHeading} id="tax">
        <TaxRateForm percent={taxRateToPercent(sales_tax_rate)} versions={taxVersions} />
      </Section>

      <Section title={s.timeZoneHeading} id="time-zone">
        <ActionForm action={timeZoneAction} aria-label={s.timeZoneHeading}>
          <input type="hidden" name="versions" value={JSON.stringify(zoneVersions)} />
          <div className="max-w-md">
            <SelectField
              name="timeZone"
              label={s.timeZone}
              hint={s.timeZoneHint}
              defaultValue={zone}
              options={timeZoneOptions(zone).map((z) => ({ value: z, label: z }))}
              required
            />
          </div>
          <SubmitButton tone="secondary">{adminCopy.common.save}</SubmitButton>
        </ActionForm>
      </Section>

      <Section title={s.pcoHeading} id="planning-center">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-muted">{s.connection}</span>
          {pco.connection === "connected" ? (
            <Badge tone="success">{s.connected}</Badge>
          ) : (
            <span className="text-warning">
              {pco.connection === "not_configured" ? s.notConfigured : s.unreachable}
            </span>
          )}
        </p>
        <SignInSettingsForm
          values={{
            adminContactEmail: signIn.adminContactEmail,
            fieldName: signIn.leader.fieldName,
            acceptedValues: signIn.leader.acceptedValues,
            requireForRequesters: signIn.leader.requireForRequesters,
            requireForStaff: signIn.leader.requireForStaff,
            googleEnabled: signIn.googleEnabled,
            planningCenterEnabled: signIn.planningCenterEnabled,
          }}
          versions={signInVersions}
          fields={pco.fields?.map((f) => ({ name: f.name, dataType: f.dataType })) ?? null}
        />
      </Section>

      <Section title={s.failingHeading} id="failing">
        {failing.length === 0 ? (
          <EmptyState>{s.failingEmpty}</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {failing.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <span>
                  <Link href={`/admin/users/${p.id}`} className={linkClass}>
                    {p.name}
                  </Link>
                  <span className="block text-fg-muted">{p.email}</span>
                </span>
                <Badge tone={p.accessStatus === "suspended_not_leader" ? "danger" : "warning"}>
                  {p.accessStatus === "suspended_not_leader"
                    ? s.failingSuspended
                    : s.failingUnverified}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
