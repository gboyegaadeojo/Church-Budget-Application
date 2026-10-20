"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { buttonClass } from "@/components/ui/styles";
import { notificationsCopy as n } from "@/copy/notifications";

/** Marks every notification read, then reloads the list and the bell's count. */
export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markAllNotificationsReadAction();
          router.refresh();
        })
      }
      className={buttonClass("secondary", "sm:ml-auto")}
    >
      <CheckCheck className="size-4" aria-hidden="true" />
      {n.markAllRead}
    </button>
  );
}
