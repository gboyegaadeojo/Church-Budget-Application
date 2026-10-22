import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, PageHeader } from "@/components/ui/display";
import { SettingsGroup, SettingsRow } from "@/components/ui/grouped-list";
import { getAppCopy as g } from "@/copy/get-app";
import { getDb } from "@/db";
import { alertsFor, listPushDevices } from "@/domain/notifications/push";
import { getChurchTimeZone } from "@/domain/settings";
import { getPushPublicKey } from "@/lib/push";
import { formatDate, zonedDate } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { AlertsSetup, InstallSetup } from "./device-setup";

export const metadata: Metadata = { title: g.title };

/** Get the app: install it on a phone or computer and turn on alerts (docs/decisions.md 2026-10-22). */
export default function GetAppPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title={g.title} intro={g.intro} />
      <InstallSetup />
      <Suspense fallback={<AdminSkeleton />}>
        <Alerts />
      </Suspense>
    </div>
  );
}

async function Alerts() {
  const viewer = await getViewer();
  const db = getDb();
  const [devices, zone, allowed] = await Promise.all([
    listPushDevices(db, viewer.id),
    getChurchTimeZone(db),
    alertsFor(db, viewer.id),
  ]);
  const day = (at: Date) => formatDate(zonedDate(at, zone));
  return (
    <>
      <AlertsSetup publicKey={getPushPublicKey()} allowed={allowed} />
      {devices.length > 0 && (
        <SettingsGroup id="devices" title={g.devices.heading} footer={g.devices.lost}>
          {devices.map((d) => (
            <SettingsRow
              key={d.id}
              label={d.device}
              description={[
                g.devices.added(day(d.createdAt)),
                d.lastSentAt ? g.devices.lastAlert(day(d.lastSentAt)) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </SettingsGroup>
      )}
    </>
  );
}
