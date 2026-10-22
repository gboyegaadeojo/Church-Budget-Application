"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Bell, BellOff, CheckCircle2, Download, Send } from "lucide-react";
import { removePushAction, testPushAction } from "@/app/actions/push";
import {
  currentSubscription,
  deviceState,
  INSTALLABLE_EVENT,
  turnOffAlerts,
  turnOnAlerts,
  type DeviceKind,
  type DeviceState,
} from "@/components/pwa/push-client";
import { SettingsCell, SettingsGroup, SettingsRow } from "@/components/ui/grouped-list";
import { buttonClass } from "@/components/ui/styles";
import { getAppCopy as g } from "@/copy/get-app";

let device: DeviceState | null = null;
const noSubscription = () => () => {};

/** The device, once the page is in the browser; null on the server and while prerendering. */
function useDevice(): DeviceState | null {
  return useSyncExternalStore(
    noSubscription,
    () => (device ??= deviceState()),
    () => null,
  );
}

const ORDER: Record<DeviceKind, DeviceKind[]> = {
  iphone: ["iphone", "android", "computer"],
  android: ["android", "iphone", "computer"],
  computer: ["computer", "iphone", "android"],
};

/** How to install: this device's steps open first, the others folded underneath. */
export function InstallSetup() {
  const device = useDevice();
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    const update = () => setCanPrompt(!!window.__installPrompt);
    update();
    window.addEventListener(INSTALLABLE_EVENT, update);
    return () => window.removeEventListener(INSTALLABLE_EVENT, update);
  }, []);

  async function install() {
    const prompt = window.__installPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    window.__installPrompt = null;
    setCanPrompt(false);
  }

  if (device?.installed) {
    return (
      <SettingsGroup id="install" title={g.install.heading}>
        <SettingsRow label={g.install.installed} description={g.install.installedHint}>
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
        </SettingsRow>
      </SettingsGroup>
    );
  }

  const kinds = ORDER[device?.kind ?? "computer"];
  return (
    <SettingsGroup id="install" title={g.install.heading}>
      {canPrompt && (
        <SettingsCell>
          <button type="button" onClick={install} className={buttonClass("primary")}>
            <Download className="size-4" aria-hidden="true" />
            {g.install.button}
          </button>
        </SettingsCell>
      )}
      {kinds.map((kind, i) => {
        const steps = g.install[kind];
        return (
          <details key={kind} open={i === 0} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 font-medium transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
              {steps.label}
            </summary>
            <ol className="list-decimal space-y-2 border-t border-border py-4 pr-4 pl-9 text-fg">
              {steps.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        );
      })}
    </SettingsGroup>
  );
}

type Message = { tone: "ok" | "error"; text: string };

/** Alerts on this device: on, off, or why they can't be turned on here. */
export function AlertsSetup({ publicKey }: { publicKey: string | null }) {
  const router = useRouter();
  const device = useDevice();
  const [on, setOn] = useState<boolean | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!device?.pushable) return;
    currentSubscription()
      .then((s) => setOn(!!s && Notification.permission === "granted"))
      .catch(() => setOn(false));
  }, [device]);

  const turnOn = () =>
    start(async () => {
      setMessage(null);
      try {
        const result = await turnOnAlerts(publicKey ?? "");
        if (result === "on") {
          setOn(true);
          router.refresh();
        } else {
          setMessage({ tone: "error", text: result === "declined" ? g.alerts.declined : result });
        }
      } catch {
        setMessage({ tone: "error", text: g.errors.save });
      }
    });

  const turnOff = () =>
    start(async () => {
      setMessage(null);
      await turnOffAlerts();
      setOn(false);
      router.refresh();
    });

  const test = () =>
    start(async () => {
      const result = await testPushAction();
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message ?? "" });
    });

  let body: React.ReactNode;
  if (!device || (device.pushable && on === null && !!publicKey)) {
    body = <SettingsCell className="text-fg-muted">…</SettingsCell>;
  } else if (!publicKey) {
    body = <SettingsCell className="text-fg-muted">{g.alerts.notSetUp}</SettingsCell>;
  } else if (device.kind === "iphone" && !device.installed) {
    body = <SettingsCell className="text-fg-muted">{g.alerts.iphoneFirst}</SettingsCell>;
  } else if (!device.pushable) {
    body = <SettingsCell className="text-fg-muted">{g.alerts.unsupported}</SettingsCell>;
  } else if (device.permission === "denied" && !on) {
    body = <SettingsCell className="text-fg-muted">{g.alerts.blocked}</SettingsCell>;
  } else if (on) {
    body = (
      <>
        <SettingsRow label={g.alerts.onHint}>
          <span className="font-medium text-success">{g.alerts.on}</span>
        </SettingsRow>
        <div className="flex flex-wrap gap-2 px-4 py-4">
          <button
            type="button"
            onClick={test}
            disabled={pending}
            className={buttonClass("secondary")}
          >
            <Send className="size-4" aria-hidden="true" />
            {g.alerts.test}
          </button>
          <button
            type="button"
            onClick={turnOff}
            disabled={pending}
            className={buttonClass("ghost")}
          >
            <BellOff className="size-4" aria-hidden="true" />
            {g.alerts.turnOff}
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <SettingsCell>
        <button
          type="button"
          onClick={turnOn}
          disabled={pending}
          className={buttonClass("primary")}
        >
          <Bell className="size-4" aria-hidden="true" />
          {pending ? g.alerts.turningOn : g.alerts.turnOn}
        </button>
      </SettingsCell>
    );
  }

  return (
    <SettingsGroup
      id="alerts"
      title={g.alerts.heading}
      footer={
        <>
          {g.alerts.hint} {g.alerts.lockScreen}
        </>
      }
    >
      {body}
      {message && (
        <div className="px-4 py-3">
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={message.tone === "error" ? "text-danger" : "text-success"}
          >
            {message.text}
          </p>
        </div>
      )}
    </SettingsGroup>
  );
}

/** Turns alerts off on one device from the list (a lost phone, an old computer). */
export function RemoveDeviceButton({ id, device }: { id: string; device: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={g.devices.remove(device)}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await removePushAction({ id });
          router.refresh();
        })
      }
      className="min-h-11 rounded-control px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none lg:min-h-9"
    >
      {g.devices.removeShort}
    </button>
  );
}
