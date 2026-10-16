"use client";

import { useActionState, useId } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import type { PcoCandidate } from "@/domain/users/admin";
import { linkPcoAction, searchPcoAction, unlinkPcoAction, type PcoSearchState } from "../actions";

const p = adminCopy.users.pco;

/**
 * Links an account to the person's Planning Center profile (FR-01a). Planning Center
 * sign-in never links by email on its own, so the administrator picks the person: from
 * the people with the account's email address, or by searching. The server checks it again.
 */
export function PcoLink({
  userId,
  name,
  version,
  linked,
  suggestions,
  problem,
}: {
  userId: string;
  /** The account holder's name, for the unlink confirmation. */
  name: string;
  version: number;
  /** The linked person; `name` is null when Planning Center couldn't be asked. */
  linked: { id: string; name: string | null } | null;
  /** People with this account's email; null when they couldn't be looked up. */
  suggestions: PcoCandidate[] | null;
  /** Why Planning Center couldn't be asked, if it couldn't. */
  problem?: string;
}) {
  const unlinkFormId = `unlink-pco-${userId}`;
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">{p.intro}</p>
      {linked ? (
        <ActionForm action={unlinkPcoAction} id={unlinkFormId} aria-label={p.unlink}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="version" value={version} />
          <p className="text-sm font-medium">
            {linked.name ? p.linked(linked.name) : p.linkedId(linked.id)}
          </p>
          <ConfirmDialog
            formId={unlinkFormId}
            trigger={p.unlink}
            triggerTone="secondary"
            title={p.unlinkTitle(name)}
            body={p.unlinkBody}
            confirmLabel={p.unlink}
            confirmTone="danger"
          />
        </ActionForm>
      ) : (
        <p className="text-sm font-medium">{p.notLinked}</p>
      )}

      {problem && (
        <p className="flex items-start gap-2 text-sm text-warning">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {problem}
        </p>
      )}

      {!linked && suggestions && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{p.suggestions}</h3>
          {suggestions.length === 0 ? (
            <p className="text-sm text-fg-muted">{p.noSuggestions}</p>
          ) : (
            <Candidates people={suggestions} userId={userId} version={version} />
          )}
        </div>
      )}

      {!problem && <Search userId={userId} version={version} />}
    </div>
  );
}

function Search({ userId, version }: { userId: string; version: number }) {
  const [state, action, pending] = useActionState(searchPcoAction, {
    status: "idle",
  } as PcoSearchState);
  const id = useId();
  const error = state.fieldErrors?.query;
  return (
    <div className="space-y-3">
      <form action={action} role="search" aria-label={p.search} className="space-y-2" noValidate>
        <input type="hidden" name="userId" value={userId} />
        <label htmlFor={`${id}-q`} className="block text-sm font-medium">
          {p.search}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={`${id}-q`}
            name="query"
            type="search"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
            className={`${inputClass} max-w-sm flex-1`}
          />
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className={buttonClass("secondary")}
          >
            {pending && (
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {p.searchButton}
          </button>
        </div>
        <p id={`${id}-hint`} className="text-xs text-fg-muted">
          {p.searchHint}
        </p>
        {error && (
          <p id={`${id}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
        {!error && <FormMessage state={state} />}
      </form>
      {state.results && state.results.length > 0 && (
        <Candidates people={state.results} userId={userId} version={version} />
      )}
    </div>
  );
}

function Candidates({
  people,
  userId,
  version,
}: {
  people: PcoCandidate[];
  userId: string;
  version: number;
}) {
  return (
    <ul className="divide-y divide-border rounded-control border border-border">
      {people.map((person) => (
        <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0 text-sm">
            <p className="font-medium">{person.name}</p>
            <p className="break-all text-fg-muted">{person.emails.join(", ")}</p>
            {person.status === "inactive" && <p className="text-fg-muted">{p.inactive}</p>}
          </div>
          {person.linkedTo && person.linkedTo.id !== userId ? (
            <p className="text-sm text-fg-muted">{p.linkedElsewhere(person.linkedTo.name)}</p>
          ) : person.linkedTo ? null : (
            <ActionForm action={linkPcoAction} aria-label={p.linkTo(person.name)}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="version" value={version} />
              <input type="hidden" name="pcoPersonId" value={person.id} />
              <SubmitButton tone="secondary">{p.linkTo(person.name)}</SubmitButton>
            </ActionForm>
          )}
        </li>
      ))}
    </ul>
  );
}
