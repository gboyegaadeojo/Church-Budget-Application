import type { LeaderSettings } from "@/domain/settings";
import {
  PlanningCenterUnavailableError,
  type PcoPerson,
  type PlanningCenterDirectory,
} from "@/lib/pco";

/**
 * The Group Leader check (FR-01a): does this person's configured Planning Center
 * custom field hold an accepted value? Default: "Ministry Leader" = "Yes".
 */

export type LeaderCheck =
  | { status: "leader"; person: PcoPerson; fieldValue: string }
  | { status: "not_leader"; person: PcoPerson; fieldValue: string | null }
  /** No Planning Center person with this id or email. */
  | { status: "not_found" }
  /** Several Planning Center people share the email; we cannot tell which is them. */
  | { status: "ambiguous" }
  /** Planning Center could not be reached, or the configured field does not exist. */
  | { status: "unavailable"; reason: string };

const TRUE_WORDS = new Set(["yes", "y", "true", "t", "1", "checked", "on"]);
const FALSE_WORDS = new Set(["no", "n", "false", "f", "0", "unchecked", "off", ""]);

/**
 * Reads a Yes/No value however it is written. Planning Center's API documents field
 * values only as strings, and its Yes/No fields accept "Yes/No" and "True/False" in any
 * case, so "Yes", "true" and "1" all mean yes. Returns null for anything else.
 */
export function parseYesNo(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  return null;
}

/**
 * Whether a field value counts. For a Yes/No ("boolean") field, values compare by
 * meaning, so an accepted "Yes" matches a stored "true". Other fields compare as text,
 * ignoring case and surrounding spaces.
 */
export function valueMatches(
  value: string,
  acceptedValues: readonly string[],
  dataType: string,
): boolean {
  const isYesNo = dataType.trim().toLowerCase() === "boolean";
  if (isYesNo) {
    const actual = parseYesNo(value);
    return actual !== null && acceptedValues.some((a) => parseYesNo(a) === actual);
  }
  const v = value.trim().toLowerCase();
  return v !== "" && acceptedValues.some((a) => a.trim().toLowerCase() === v);
}

/**
 * Finds the Planning Center person (by person id when known, otherwise by email) and
 * checks their field. Never throws for Planning Center problems: an outage, bad
 * credentials or a missing field come back as "unavailable" so callers apply the
 * 72-hour rule.
 */
export async function checkLeader(
  directory: PlanningCenterDirectory,
  settings: Pick<LeaderSettings, "fieldName" | "acceptedValues">,
  who: { pcoPersonId?: string | null; email?: string | null },
): Promise<LeaderCheck> {
  try {
    let person: PcoPerson | null = null;
    if (who.pcoPersonId) {
      person = await directory.getPerson(who.pcoPersonId);
    } else if (who.email) {
      const matches = (await directory.findPeopleByEmail(who.email)).filter(
        (p) => p.status !== "inactive",
      );
      if (matches.length > 1) return { status: "ambiguous" };
      person = matches[0] ?? null;
    }
    if (!person) return { status: "not_found" };

    const field = await directory.findFieldDefinition(settings.fieldName);
    if (!field) {
      return {
        status: "unavailable",
        reason: `The Planning Center field "${settings.fieldName}" was not found`,
      };
    }

    const values = await directory.getFieldValues(person.id, field.id);
    if (person.status === "inactive") {
      return { status: "not_leader", person, fieldValue: values[0] ?? null };
    }
    const accepted = values.find((v) => valueMatches(v, settings.acceptedValues, field.dataType));
    return accepted !== undefined
      ? { status: "leader", person, fieldValue: accepted }
      : { status: "not_leader", person, fieldValue: values[0] ?? null };
  } catch (error) {
    if (error instanceof PlanningCenterUnavailableError) {
      return { status: "unavailable", reason: error.message };
    }
    throw error;
  }
}
