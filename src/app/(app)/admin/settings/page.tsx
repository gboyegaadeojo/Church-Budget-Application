import {
  Globe2,
  MessageSquare,
  Palette,
  Percent,
  Plug,
  Settings2,
  ShieldCheck,
  UserX,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/action-form";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  IconChip,
  PageHeader,
  PermissionDenied,
  Section,
  type Tone,
} from "@/components/ui/display";
import { linkClass, standaloneLinkClass } from "@/components/ui/styles";
import { cn } from "@/lib/cn";
import { adminCopy } from "@/copy/admin";
import { brandingCopy } from "@/copy/branding";
import { getDb } from "@/db";
import {
  getChurchTimeZone,
  getDepartmentFieldSettings,
  getSignInSettings,
  readSettings,
  secondApprovalThreshold,
} from "@/domain/settings";
import { settingVersions } from "@/domain/settings/service";
import { churchToday, listSigners } from "@/domain/signers/service";
import { accountantTeam, failingRequesters } from "@/domain/users/admin-queries";
import { viewerAllowedTo } from "@/lib/admin-server";
import { centsToInput } from "@/domain/annual/schema";
import { formatCAD, taxRateToPercent } from "@/lib/money";
import type { PcoFieldDefinition } from "@/lib/pco";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";
import { smsConfigured } from "@/lib/sms/config";
import { smsUsage } from "@/lib/sms/outbox";
import { secondApprovalAction, smsLimitAction, timeZoneAction } from "./actions";
import { AccountantsSection, SignersSection } from "./people-sections";
import { SignInSettingsForm, TaxRateForm } from "./settings-forms";

const s = adminCopy.settings;

export const metadata: Metadata = { title: s.title };

const SIGN_IN_KEYS = [
  "admin_contact_email",
  "pco_leader_field_name",
  "pco_leader_accepted_values",
  "pco_require_for_requesters",
  "pco_require_for_staff",
  "pco_department_field_name",
  "pco_department_mode",
  "signin_planning_center_enabled",
  "signin_email_enabled",
] as const;

/** The categories down the left, like a phone's or computer's settings. */
const CATEGORIES: { key: keyof typeof s.sections; icon: LucideIcon; tone: Tone }[] = [
  { key: "general", icon: Settings2, tone: "slate" },
  { key: "money", icon: Percent, tone: "teal" },
  { key: "people", icon: UsersRound, tone: "blue" },
  { key: "sign-in", icon: Plug, tone: "amber" },
  { key: "texts", icon: MessageSquare, tone: "green" },
];
type Category = (typeof CATEGORIES)[number]["key"];

const isCategory = (value: unknown): value is Category => CATEGORIES.some((c) => c.key === value);

/**
 * Admin → Settings (DRD 6.11), one category at a time: General (branding, time zone),
 * Money (sales tax, second approval), People (Primary accountant, cheque signers),
 * Sign-in (Planning Center, requesters failing verification) and Reminder texts
 * (FR-07a, FR-30, FR-33, FR-34, FR-53, FR-01a).
 */
export default function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <SettingsBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SettingsBody({ searchParams }: Pick<PageProps<"/admin/settings">, "searchParams">) {
  const viewer = await viewerAllowedTo("admin.settings", "/admin/settings");
  if (!viewer) return <PermissionDenied />;
  const { section } = await searchParams;
  const current: Category = isCategory(section) ? section : "general";
  return (
    <>
      <PageHeader title={s.title} />
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <SettingsNav current={current} />
        <div className="min-w-0 space-y-6">
          <Suspense key={current} fallback={<AdminSkeleton />}>
            <CategoryContent category={current} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

function SettingsNav({ current }: { current: Category }) {
  return (
    <nav aria-label={s.navLabel} className="min-w-0 lg:sticky lg:top-24">
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {CATEGORIES.map(({ key, icon, tone }) => {
          const active = key === current;
          return (
            <li key={key} className="shrink-0">
              <Link
                href={`/admin/settings?section=${key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-[12px] px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none lg:whitespace-normal",
                  active
                    ? "bg-surface text-fg shadow-sm ring-1 ring-border"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <IconChip icon={icon} tone={tone} size="sm" />
                <span className="min-w-0">
                  <span className="block">{s.sections[key].label}</span>
                  <span className="hidden text-xs font-normal text-fg-muted lg:block">
                    {s.sections[key].hint}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Each category loads only its own data. SettingsBody has checked permission. */
function CategoryContent({ category }: { category: Category }) {
  switch (category) {
    case "money":
      return <MoneySettings />;
    case "people":
      return <PeopleSettings />;
    case "sign-in":
      return <SignInSettings />;
    case "texts":
      return <TextSettings />;
    default:
      return <GeneralSettings />;
  }
}

function timeZoneOptions(current: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
}

async function GeneralSettings() {
  const db = getDb();
  const [zone, zoneVersions] = await Promise.all([
    getChurchTimeZone(db),
    settingVersions(db, ["church_timezone"]),
  ]);
  return (
    <>
      <Section
        title={brandingCopy.settingsHeading}
        description={brandingCopy.settingsIntro}
        id="branding"
        icon={Palette}
        tone="pink"
      >
        <Link href="/admin/settings/branding" className={cn(linkClass, standaloneLinkClass)}>
          {brandingCopy.settingsLink}
        </Link>
      </Section>

      <Section title={s.timeZoneHeading} id="time-zone" icon={Globe2} tone="blue">
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
    </>
  );
}

async function MoneySettings() {
  const db = getDb();
  const [{ sales_tax_rate }, taxVersions, threshold, thresholdVersions] = await Promise.all([
    readSettings(db, ["sales_tax_rate"]),
    settingVersions(db, ["sales_tax_rate"]),
    secondApprovalThreshold(db),
    settingVersions(db, ["second_approval_threshold"]),
  ]);
  return (
    <>
      <Section title={s.taxHeading} id="tax" icon={Percent} tone="teal">
        <TaxRateForm percent={taxRateToPercent(sales_tax_rate)} versions={taxVersions} />
      </Section>

      <Section
        title={s.threshold.heading}
        description={s.threshold.intro}
        id="second-approval"
        icon={ShieldCheck}
        tone="violet"
      >
        <ActionForm action={secondApprovalAction} aria-label={s.threshold.heading}>
          <input type="hidden" name="versions" value={JSON.stringify(thresholdVersions)} />
          <p className="text-sm font-medium">
            {threshold === null ? s.threshold.off : s.threshold.on(formatCAD(threshold))}
          </p>
          <div className="max-w-xs">
            <TextField
              name="amount"
              label={s.threshold.label}
              hint={s.threshold.hint}
              defaultValue={threshold === null ? "" : centsToInput(threshold)}
              inputMode="decimal"
              autoComplete="off"
            />
          </div>
          <SubmitButton tone="secondary">{s.threshold.save}</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}

async function PeopleSettings() {
  const db = getDb();
  const [{ primary_accountant_user_id }, primaryVersions, team, signers, today] = await Promise.all(
    [
      readSettings(db, ["primary_accountant_user_id"]),
      settingVersions(db, ["primary_accountant_user_id"]),
      accountantTeam(db),
      listSigners(db),
      churchToday(db),
    ],
  );
  return (
    <>
      <AccountantsSection
        team={team}
        primaryId={primary_accountant_user_id}
        versions={primaryVersions}
      />
      <SignersSection signers={signers} today={today} />
    </>
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

async function SignInSettings() {
  const db = getDb();
  const [signIn, signInVersions, failing, pco, departmentField] = await Promise.all([
    getSignInSettings(db),
    settingVersions(db, SIGN_IN_KEYS),
    failingRequesters(db),
    planningCenterStatus(),
    getDepartmentFieldSettings(db),
  ]);
  return (
    <>
      <Section title={s.pcoHeading} id="planning-center" icon={Plug} tone="amber">
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
            departmentFieldName: departmentField.fieldName,
            departmentMode: departmentField.mode,
            planningCenterEnabled: signIn.planningCenterEnabled,
            emailEnabled: signIn.emailEnabled,
          }}
          versions={signInVersions}
          fields={pco.fields?.map((f) => ({ name: f.name, dataType: f.dataType })) ?? null}
        />
      </Section>

      <Section title={s.failingHeading} id="failing" icon={UserX} tone="red">
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
                  <Link
                    href={`/admin/users/${p.id}`}
                    className={cn(linkClass, standaloneLinkClass)}
                  >
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

async function TextSettings() {
  const db = getDb();
  const [sms, smsVersions] = await Promise.all([
    smsUsage(db),
    settingVersions(db, ["sms_monthly_limit"]),
  ]);
  return (
    <Section
      title={s.sms.heading}
      description={s.sms.intro}
      id="reminder-texts"
      icon={MessageSquare}
      tone="green"
    >
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-fg-muted">{s.sms.connection}</span>
        {smsConfigured() ? (
          <Badge tone="success">{s.sms.connected}</Badge>
        ) : (
          <span className="text-warning">{s.sms.notConfigured}</span>
        )}
      </p>
      <p className="text-sm">{s.sms.usage(sms.sent, sms.limit)}</p>
      {sms.failed > 0 ? <p className="text-sm text-fg-muted">{s.sms.failed(sms.failed)}</p> : null}
      <ActionForm action={smsLimitAction} aria-label={s.sms.heading}>
        <input type="hidden" name="versions" value={JSON.stringify(smsVersions)} />
        <div className="max-w-xs">
          <TextField
            name="limit"
            label={s.sms.label}
            hint={s.sms.hint}
            defaultValue={String(sms.limit)}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <SubmitButton tone="secondary">{s.sms.save}</SubmitButton>
      </ActionForm>
    </Section>
  );
}
