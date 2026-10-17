"use client";

import { useState } from "react";
import { useFieldError } from "./action-form";

/**
 * Shows its children once the server has asked for this field (a warning to confirm, a
 * note it needs), and keeps showing them after, so the answer isn't lost when another
 * field is corrected. `show` reveals it from the start (for example, a saved value).
 */
export function RevealOnError({
  name,
  show = false,
  children,
}: {
  name: string;
  show?: boolean;
  children: React.ReactNode;
}) {
  const error = useFieldError(name);
  const [shown, setShown] = useState(show);
  // Adjusting state while rendering, as React recommends over an effect.
  if (error && !shown) setShown(true);
  return shown || error ? <>{children}</> : null;
}
