"use client";

import { ActionForm, SelectField, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/display";
import { adminCopy } from "@/copy/admin";
import { nominateBackupAction } from "./actions";

const d = adminCopy.departments;
const n = d.nominate;

/**
 * The Primary's view of their department's leaders, with "Make Backup" (FR-38, AC-117).
 * Only verified Group Leaders are offered; the server checks everything again.
 */
export function LeadersPanel({
  department,
  leaders,
  candidates,
}: {
  department: { id: string; name: string };
  leaders: { userId: string; name: string; slot: keyof typeof d.slotLabels }[];
  candidates: { id: string; name: string }[];
}) {
  return (
    <section
      aria-labelledby={`leaders-${department.id}`}
      className="space-y-4 rounded-card border border-border bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="space-y-1">
        <h2 id={`leaders-${department.id}`} className="text-lg font-semibold">
          {n.heading(department.name)}
        </h2>
        <p className="text-sm text-fg-muted">{n.intro}</p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {leaders.map((l) => (
          <li key={l.userId}>
            <Badge tone={l.slot === "primary" ? "info" : "neutral"}>
              {d.slotLabels[l.slot]} · {l.name}
            </Badge>
          </li>
        ))}
      </ul>
      {candidates.length === 0 ? (
        <p className="text-sm text-fg-muted">{n.none}</p>
      ) : (
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
      )}
    </section>
  );
}
