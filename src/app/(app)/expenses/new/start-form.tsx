"use client";

import { useActionState, useId, useState } from "react";
import { FileText, Receipt } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/ui/action-form";
import { IconChip } from "@/components/ui/display";
import { cardClass, inputClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import type { StartDepartment } from "@/domain/expenses/queries";
import { EXPENSE_TYPES, type ExpenseType } from "@/domain/expenses/status";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { startExpenseAction } from "../actions";

const s = expensesCopy.start;
const ICON = { purchase_request: FileText, expense_claim: Receipt } as const;

/**
 * Two large choices (DRD 6.9a), then the department and the budget year it's charged to.
 * Only departments with an approved budget are offered (AC-78); the server checks again.
 */
export function StartExpenseForm({ departments }: { departments: StartDepartment[] }) {
  const [state, formAction] = useActionState(startExpenseAction, {
    status: "idle",
  } as ActionState);
  const ids = useId();
  const [type, setType] = useState<ExpenseType | "">("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const department = departments.find((d) => d.id === departmentId);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} noValidate className={cn(cardClass, "space-y-6")}>
      <fieldset
        className="space-y-3"
        aria-describedby={errors.type ? `${ids}-type-error` : undefined}
      >
        <legend className="text-sm font-medium">{s.typeLegend}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {EXPENSE_TYPES.map((t) => (
            <label
              key={t}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors duration-fast hover:border-accent hover:bg-surface-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                type === t ? "border-accent ring-2 ring-accent" : "border-border-strong",
              )}
            >
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="sr-only"
              />
              <IconChip icon={ICON[t]} tone={t === "purchase_request" ? "teal" : "amber"} />
              <span className="space-y-1">
                <span className="block font-semibold">{s.types[t].title}</span>
                <span className="block text-sm text-fg-muted">{s.types[t].body}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.type && (
          <p id={`${ids}-type-error`} className="text-sm text-danger">
            {errors.type}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-department`} className="block text-sm font-medium">
            {s.department}
          </label>
          <select
            id={`${ids}-department`}
            name="departmentId"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            aria-invalid={errors.departmentId ? true : undefined}
            className={inputClass}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {errors.departmentId && <p className="text-sm text-danger">{errors.departmentId}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-cycle`} className="block text-sm font-medium">
            {s.cycle}
          </label>
          <select
            key={departmentId}
            id={`${ids}-cycle`}
            name="cycleId"
            defaultValue={department?.defaultCycleId ?? ""}
            aria-describedby={`${ids}-cycle-hint`}
            aria-invalid={errors.cycleId ? true : undefined}
            className={inputClass}
          >
            {department?.cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p id={`${ids}-cycle-hint`} className="text-xs text-fg-muted">
            {s.cycleHint}
          </p>
          {errors.cycleId && <p className="text-sm text-danger">{errors.cycleId}</p>}
        </div>
      </div>

      <div className="flex justify-end">
        <SubmitButton>{s.continue}</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
