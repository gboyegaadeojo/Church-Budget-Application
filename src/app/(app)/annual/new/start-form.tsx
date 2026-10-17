"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/display";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import type { DepartmentChoice } from "@/domain/annual/queries";
import { closeMatches } from "@/domain/departments/matching";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { startAction } from "../actions";
import { StepIndicator } from "../step-indicator";

const s = annualCopy.start;
const OTHER = "other";

/**
 * The department picker (DRD 6.3 step 1, FR-03): a filterable list with the person's
 * own departments first ("Yours") and Other pinned last. Choosing a department that
 * already has a request offers to open it instead of starting another (FR-32).
 */
export function StartForm({
  cycle,
  choices,
  allowOther,
  restricted,
}: {
  cycle: { id: string; name: string };
  choices: DepartmentChoice[];
  allowOther: boolean;
  restricted: boolean;
}) {
  const [state, formAction] = useActionState(startAction, { status: "idle" } as ActionState);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    () => choices.find((c) => c.yours || c.fromPlanningCenter)?.id ?? "",
  );
  const [otherName, setOtherName] = useState("");
  const ids = useId();
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  const q = query.trim().toLowerCase();
  const visible = (c: DepartmentChoice) => q === "" || c.name.toLowerCase().includes(q);
  const anyVisible = choices.some(visible);
  const chosen = choices.find((c) => c.id === selected);
  const suggestions = useMemo(
    () =>
      selected === OTHER
        ? closeMatches(
            otherName,
            choices.map((c) => c.name),
          )
        : [],
    [selected, otherName, choices],
  );

  return (
    <form action={formAction} noValidate className={cn(cardClass, "space-y-6")}>
      <StepIndicator current={0} />
      <input type="hidden" name="cycleId" value={cycle.id} />
      <p className="text-sm">
        <span className="text-fg-muted">{s.year}: </span>
        <span className="font-medium">{cycle.name}</span>
      </p>

      <fieldset
        className="min-w-0 space-y-3"
        aria-describedby={errors.departmentId ? `${ids}-dept-error` : undefined}
      >
        <legend className="text-sm font-medium">{s.department}</legend>
        {choices.length > 0 && (
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-search`} className="block text-sm text-fg-muted">
              {s.search}
            </label>
            <input
              id={`${ids}-search`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </div>
        )}
        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-control border border-border">
          {choices.map((c) => (
            <li key={c.id} hidden={!visible(c)}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-hover">
                <input
                  type="radio"
                  name="department"
                  value={c.id}
                  checked={selected === c.id}
                  onChange={() => setSelected(c.id)}
                  // Named by the department alone; the badges describe it.
                  aria-labelledby={`${ids}-${c.id}-name`}
                  aria-describedby={
                    c.existing || c.yours || c.fromPlanningCenter
                      ? `${ids}-${c.id}-tags`
                      : undefined
                  }
                  className="size-5 shrink-0 accent-accent"
                />
                <span id={`${ids}-${c.id}-name`} className="flex-1 text-sm">
                  {c.name}
                </span>
                {(c.existing || c.yours || c.fromPlanningCenter) && (
                  <span id={`${ids}-${c.id}-tags`} className="flex gap-1.5">
                    {c.existing && <Badge>{s.hasBudget}</Badge>}
                    {c.yours && <Badge tone="info">{s.yours}</Badge>}
                    {c.fromPlanningCenter && !c.yours && (
                      <Badge tone="info">{s.fromPlanningCenter}</Badge>
                    )}
                  </span>
                )}
              </label>
            </li>
          ))}
          {choices.length > 0 && !anyVisible && (
            <li className="px-3 py-2 text-sm text-fg-muted">
              {restricted ? s.noMatchesRestricted : s.noMatches}
            </li>
          )}
          {choices.length === 0 && (
            <li className="px-3 py-2 text-sm text-fg-muted">
              {restricted ? s.restrictedEmpty : s.noDepartments}
            </li>
          )}
          {allowOther && (
            <li>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-hover">
                <input
                  type="radio"
                  name="department"
                  value={OTHER}
                  checked={selected === OTHER}
                  onChange={() => setSelected(OTHER)}
                  className="size-5 shrink-0 accent-accent"
                />
                <span className="text-sm">{s.other}</span>
              </label>
            </li>
          )}
        </ul>
        {errors.departmentId && (
          <p id={`${ids}-dept-error`} className="text-sm text-danger">
            {errors.departmentId}
          </p>
        )}
      </fieldset>

      {selected === OTHER && (
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-other`} className="block text-sm font-medium">
            {s.otherName}
          </label>
          <input
            id={`${ids}-other`}
            name="otherName"
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            maxLength={80}
            autoComplete="off"
            aria-invalid={errors.otherName ? true : undefined}
            aria-describedby={[`${ids}-other-hint`, errors.otherName && `${ids}-other-error`]
              .filter(Boolean)
              .join(" ")}
            className={inputClass}
          />
          <p id={`${ids}-other-hint`} className="text-xs text-fg-muted">
            {s.otherHint}
          </p>
          {errors.otherName && (
            <p id={`${ids}-other-error`} className="text-sm text-danger">
              {errors.otherName}
            </p>
          )}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-sm" aria-live="polite">
              <span className="text-fg-muted">{s.didYouMean}</span>
              {suggestions.map((name) => {
                const match = choices.find((c) => c.name === name);
                return match ? (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setSelected(match.id);
                      setQuery("");
                    }}
                    className={buttonClass("secondary")}
                  >
                    {s.useSuggestion(name)}
                  </button>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}

      {chosen?.existing && (
        <div role="status" className="rounded-control border border-info p-4 text-sm">
          {existingNote(chosen.name, chosen.existing)}
        </div>
      )}

      {/* FR-35: only for a department with an earlier request and no budget this year. */}
      {chosen?.lastYear && !chosen.existing && (
        <div className="space-y-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="fromLastYear"
              value="yes"
              aria-describedby={`${ids}-last-year-hint`}
              className="size-5 shrink-0 accent-accent"
            />
            {s.lastYear(chosen.lastYear.cycleName, chosen.lastYear.reference)}
          </label>
          <p id={`${ids}-last-year-hint`} className="pl-8 text-xs text-fg-muted">
            {s.lastYearHint}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <SubmitButton className="w-full sm:w-auto">
          {chosen?.existing ? existingAction(chosen.existing) : s.continue}
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

type Existing = NonNullable<DepartmentChoice["existing"]>;

/** What a person picking a department that already has a budget can do with it. */
function existingNote(department: string, existing: Existing): string {
  if (existing.status === "draft") return s.existingDraft(department, existing.startedBy);
  if (existing.status === "returned") return s.existingReturned(department);
  const status = annualCopy.status[existing.status].label;
  return existing.editable
    ? s.existingEditable(department, status, existing.editsLeft)
    : s.existingLocked(department, status);
}

function existingAction(existing: Existing): string {
  return existing.status === "draft" || existing.status === "returned" ? s.continueIt : s.openIt;
}
