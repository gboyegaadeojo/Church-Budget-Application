"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing } from "lucide-react";
import { buttonClass } from "@/components/ui/styles";
import { getAppCopy as g } from "@/copy/get-app";
import { currentSubscription, deviceState, turnOnAlerts } from "./push-client";

type State = "hidden" | "ask" | "blocked";

/**
 * Alerts are on for everyone (decided by the church 2026-10-22), but only the person
 * holding the phone can allow them. In the installed app this card sits at the top of
 * every page until they tap Allow; it has no close button. In a plain browser tab it
 * stays out of the way: Get the app explains installing first.
 */
export function AlertsPrompt({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("hidden");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const device = deviceState();
    if (!device.installed || !device.pushable) return;
    let cancelled = false;
    (async () => {
      const subscribed =
        device.permission === "granted" && !!(await currentSubscription().catch(() => null));
      if (cancelled || subscribed) return;
      setState(device.permission === "denied" ? "blocked" : "ask");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "hidden") return null;

  const allow = () =>
    start(async () => {
      setError(null);
      try {
        const result = await turnOnAlerts(publicKey);
        if (result === "on") setState("hidden");
        else if (result === "declined")
          setState(Notification.permission === "denied" ? "blocked" : "ask");
        else setError(result);
      } catch {
        setError(g.errors.save);
      }
    });

  return (
    <section
      aria-labelledby="alerts-prompt-heading"
      className="mb-6 flex flex-col gap-4 rounded-card border border-accent/30 bg-accent-soft p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-accent text-on-accent">
        <BellRing className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 id="alerts-prompt-heading" className="font-semibold">
          {g.prompt.heading}
        </h2>
        <p className="text-sm text-fg-muted">
          {state === "blocked" ? g.prompt.blocked : g.prompt.body}
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      {state === "ask" && (
        <button
          type="button"
          onClick={allow}
          disabled={pending}
          className={buttonClass("primary", "shrink-0")}
        >
          {pending ? g.alerts.turningOn : g.prompt.button}
        </button>
      )}
    </section>
  );
}
