"use client";

import { ChevronRight } from "lucide-react";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/display";
import { SettingsDisclosure, SettingsRow } from "@/components/ui/grouped-list";
import { accountCopy } from "@/copy/account";
import { adminCopy } from "@/copy/admin";
import { formatDate } from "@/lib/time-zone";
import {
  clearDepartmentAwayAction,
  nominateBackupAction,
  setDepartmentAwayAction,
} from "./actions";

const w = accountCopy.department;
const aw = accountCopy.away;

const d = adminCopy.departments;
const n = d.nominate;

/** "Sam Lee" → "SL". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

/**
 * The Primary's view of their department's leaders (FR-38, AC-117), as slim rows: each
 * leader with their place, "Make someone a Backup" folded into a row, and Away with its
 * state on the right. Only verified Group Leaders are offered; the server checks again.
 */
export function LeadersPanel({
  department,
  leaders,
  candidates,
  away,
  today,
  defaultOpen = false,
}: {
  /** Open on arrival: the person leads only this department. */
  defaultOpen?: boolean;
  department: { id: string; name: string };
  leaders: { userId: string; name: string; slot: keyof typeof d.slotLabels }[];
  candidates: { id: string; name: string }[];
  /** The Primary's Away (FR-38), as church-local days. */
  away: { active: boolean; set: boolean; from: string; until: string; hasBackup: boolean };
  today: string;
}) {
  const awayState = away.active
    ? away.until
      ? w.statusUntil(formatDate(away.until))
      : w.statusOn
    : away.set && away.from
      ? w.statusFrom(formatDate(away.from))
      : w.statusOff;
  return (
    <section aria-labelledby={`leaders-${department.id}`}>
      <details open={defaultOpen} className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <h3 id={`leaders-${department.id}`} className="font-semibold">
              {n.heading(department.name)}
            </h3>
            <span className="block truncate text-xs text-fg-muted">
              {n.summary(
                leaders.map((l) => `${d.slotLabels[l.slot]} ${l.name}`).join(" · "),
                awayState,
              )}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-fg-muted transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
          />
        </summary>

        <div className="divide-y divide-border border-t border-border text-sm">
          <ul className="divide-y divide-border">
            {leaders.map((l) => (
              <li key={l.userId} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-fg-muted"
                >
                  {initials(l.name)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                <Badge tone={l.slot === "primary" ? "info" : "neutral"}>
                  {d.slotLabels[l.slot]}
                </Badge>
              </li>
            ))}
          </ul>

          {candidates.length === 0 ? (
            <SettingsRow label={<span className="font-normal text-fg-muted">{n.none}</span>} />
          ) : (
            <SettingsDisclosure accent label={n.addRow}>
              <ActionForm action={nominateBackupAction} aria-label={n.heading(department.name)}>
                <input type="hidden" name="departmentId" value={department.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    name="userId"
                    label={n.person}
                    required
                    placeholder={n.choose}
                    options={candidates.map((c) => ({ value: c.id, label: c.name }))}
                  />
                  <SelectField
                    name="slot"
                    label={n.slot}
                    required
                    defaultValue="backup_1"
                    options={(["backup_1", "backup_2"] as const).map((s) => ({
                      value: s,
                      label: d.slotLabels[s],
                    }))}
                  />
                </div>
                <SubmitButton tone="secondary">{n.save}</SubmitButton>
              </ActionForm>
            </SettingsDisclosure>
          )}
        </div>

        <div className="border-t border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-6">
            <h4 className="text-sm font-semibold">{w.heading}</h4>
            <Badge tone={away.active ? "warning" : "neutral"}>{awayState}</Badge>
          </div>
          <p className="px-4 pt-1 pb-3 text-xs text-fg-muted sm:px-6">{w.intro}</p>
          <div className="border-t border-border text-sm">
            {!away.hasBackup ? (
              <SettingsRow
                label={<span className="font-normal text-fg-muted">{w.noBackup}</span>}
              />
            ) : (
              <SettingsDisclosure accent label={away.set ? w.changeRow : w.setRow}>
                <ActionForm
                  action={setDepartmentAwayAction}
                  aria-label={`${department.name}: ${w.heading}`}
                >
                  <input type="hidden" name="departmentId" value={department.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      name="from"
                      type="date"
                      label={aw.from}
                      hint={aw.fromHint}
                      defaultValue={away.from || today}
                      required
                    />
                    <TextField
                      name="until"
                      type="date"
                      label={aw.until}
                      hint={aw.untilHint}
                      defaultValue={away.until}
                    />
                  </div>
                  <SubmitButton tone="secondary">{away.set ? aw.update : w.save}</SubmitButton>
                </ActionForm>
                {away.set && (
                  <ActionForm
                    action={clearDepartmentAwayAction}
                    aria-label={`${department.name}: ${w.off}`}
                  >
                    <input type="hidden" name="departmentId" value={department.id} />
                    <SubmitButton tone="ghost">{w.off}</SubmitButton>
                  </ActionForm>
                )}
              </SettingsDisclosure>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}
