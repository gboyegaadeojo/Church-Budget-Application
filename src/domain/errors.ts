import type { z } from "zod";

/**
 * Errors services throw. Server actions turn them into messages for the person
 * (src/app/(app)/admin/run-action.ts); anything else is an unexpected failure.
 */

/** Input that failed validation, with a message per field. */
export class ValidationError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string>,
    message = "Please check the highlighted fields.",
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/** A business rule refused the change; the message is shown as is. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

/** Someone else changed the record since it was opened (optimistic concurrency, DRD 11.2). */
export class ConflictError extends Error {
  constructor(readonly entity: { type: string; id: string }) {
    super(`${entity.type} ${entity.id} was changed by someone else`);
    this.name = "ConflictError";
  }
}

/** Parses with a Zod schema, or throws ValidationError with the first message per field. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  throw new ValidationError(fieldErrors);
}
