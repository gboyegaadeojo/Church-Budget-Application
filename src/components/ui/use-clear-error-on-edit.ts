"use client";

import { useEffect } from "react";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

/**
 * Takes a field's error message away as soon as the person edits that field.
 *
 * The forms show errors that a save or a check put there with `setError`, and
 * react-hook-form keeps those until they're cleared by hand. Without this, a message
 * from a half-typed value (an autosave mid-typing) stayed under a box after the value
 * was put right. The next save or check shows it again if it's still wrong.
 */
export function useClearErrorOnEdit<T extends FieldValues>(form: UseFormReturn<T>): void {
  const { watch, getFieldState, clearErrors } = form;
  useEffect(() => {
    const subscription = watch((_values, { name, type }) => {
      // Only the person's own typing or choosing: adding, removing or moving rows has no type.
      if (type !== "change" || !name) return;
      const field = name as FieldPath<T>;
      if (getFieldState(field).error) clearErrors(field);
    });
    return () => subscription.unsubscribe();
  }, [watch, getFieldState, clearErrors]);
}
