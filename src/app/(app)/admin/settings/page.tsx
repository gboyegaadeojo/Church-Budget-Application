import { MessageSquare, Percent, Plug, Settings2, UsersRound, type LucideIcon } from "lucide-react";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/action-form";
import {
  AdminSkeleton,
  Badge,
  IconChip,
  PageHeader,
  PermissionDenied,
  type Tone,
} from "@/components/ui/display";
import { linkClass, standaloneLinkClass } from "@/components/ui/styles";
import { cn } from "@/lib/cn";
import { adminCopy } from "@/copy/admin";
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
import {
  SettingsDisclosure,
  SettingsGroup,
  SettingsLinkRow,
  SettingsRow,
} from "@/components/ui/grouped-list";

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
 * Admin → Settings (DRD 6.11), one category at a time, as groups of slim rows that show
 * each current value and open in place to change it (decided by the church 2026-10-20):
 * General (branding, time zone), Money (sales tax, second approval), People (Primary
 * accountant, cheque signers), Sign-in (Planning Center, requesters failing verification)
 * and Reminder texts (FR-07a, FR-30, FR-33, FR-34, FR-53, FR-01a).
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
  const category = CATEGORIES.find((c) => c.key === current)!;
  return (
    <>
      <PageHeader title={s.title} />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,46rem)] lg:items-start lg:gap-10">
        <SettingsNav current={current} />
        <div className="min-w-0 space-y-8">
          <div className="flex items-center gap-3">
            <IconChip icon={category.icon} tone={category.tone} />
            <div className="min-w-0">
              <h2 className="text-xl leading-tight font-semibold tracking-tight">
                {s.sections[current].label}
              </h2>
              <p className="text-sm text-fg-muted">{s.sections[current].hint}</p>
            </div>
          </div>
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
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {CATEGORIES.map(({ key, icon, tone }) => {
          const active = key === current;
          return (
            <li key={key} className="shrink-0">
              <Link
                href={`/admin/settings?section=${key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none",
                  active
                    ? "bg-surface text-fg shadow-sm ring-1 ring-border"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <IconChip icon={icon} tone={tone} size="sm" />
                {s.sections[key].label}
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
    <SettingsGroup title={s.groups.church} id="church" footer={s.timeZoneHint}>
      <SettingsLinkRow
        href="/admin/settings/branding"
        label={s.rows.branding}
        value={s.rows.brandingValue}
      />
      <SettingsDisclosure label={s.timeZone} value={zone}>
        <ActionForm action={timeZoneAction} aria-label={s.timeZoneHeading}>
          <input type="hidden" name="versions" value={JSON.stringify(zoneVersions)} />
          <div className="max-w-md">
            <SelectField
              name="timeZone"
              label={s.timeZone}
              defaultValue={zone}
              options={timeZoneOptions(zone).map((z) => ({ value: z, label: z }))}
              required
            />
          </div>
          <SubmitButton tone="secondary">{adminCopy.common.save}</SubmitButton>
        </ActionForm>
      </SettingsDisclosure>
    </SettingsGroup>
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
  const percent = taxRateToPercent(sales_tax_rate);
  return (
    <>
      <SettingsGroup title={s.groups.tax} id="tax" footer={s.taxWarning}>
        <SettingsDisclosure label={s.rows.taxRate} value={`${percent}%`}>
          <TaxRateForm percent={percent} versions={taxVersions} />
        </SettingsDisclosure>
      </SettingsGroup>

      <SettingsGroup title={s.groups.largeBudgets} id="second-approval" footer={s.threshold.intro}>
        <SettingsDisclosure
          label={s.rows.secondApproval}
          value={threshold === null ? s.rows.off : s.rows.atOrAbove(formatCAD(threshold))}
        >
          <ActionForm action={secondApprovalAction} aria-label={s.threshold.heading}>
            <input type="hidden" name="versions" value={JSON.stringify(thresholdVersions)} />
            <p className="text-sm">
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
        </SettingsDisclosure>
      </SettingsGroup>
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
      <SettingsGroup title={s.pcoHeading} id="planning-center">
        <SettingsRow label={s.connection}>
          {pco.connection === "connected" ? (
            <Badge tone="success">{s.connected}</Badge>
          ) : (
            <span className="text-right text-warning">
              {pco.connection === "not_configured" ? s.notConfigured : s.unreachable}
            </span>
          )}
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title={s.failingHeading}
        id="failing"
        actions={failing.length > 0 ? String(failing.length) : undefined}
      >
        {failing.length === 0 ? (
          <SettingsRow label={s.failingEmpty} />
        ) : (
          failing.map((p) => (
            <SettingsRow
              key={p.id}
              label={
                <Link href={`/admin/users/${p.id}`} className={cn(linkClass, standaloneLinkClass)}>
                  {p.name}
                </Link>
              }
              description={p.email}
            >
              <Badge tone={p.accessStatus === "suspended_not_leader" ? "danger" : "warning"}>
                {p.accessStatus === "suspended_not_leader"
                  ? s.failingSuspended
                  : s.failingUnverified}
              </Badge>
            </SettingsRow>
          ))
        )}
      </SettingsGroup>

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
    <SettingsGroup title={s.sms.heading} id="reminder-texts" footer={s.sms.intro}>
      <SettingsRow label={s.sms.connection.replace(/:$/, "")}>
        {smsConfigured() ? (
          <Badge tone="success">{s.sms.connected}</Badge>
        ) : (
          <span className="text-right text-warning">{s.sms.notConfigured}</span>
        )}
      </SettingsRow>
      <SettingsRow label={s.rows.sentThisMonth}>
        <span className="tabular">{s.rows.sentValue(sms.sent, sms.limit)}</span>
      </SettingsRow>
      {sms.failed > 0 && (
        <SettingsRow label={s.rows.failedThisMonth}>
          <span className="tabular">{sms.failed}</span>
        </SettingsRow>
      )}
      <SettingsDisclosure
        label={s.rows.monthlyLimit}
        value={<span className="tabular">{sms.limit}</span>}
      >
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
      </SettingsDisclosure>
    </SettingsGroup>
  );
}
