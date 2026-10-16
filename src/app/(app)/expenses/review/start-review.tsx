"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Opening a Submitted expense on the review screen starts the review (FR-44, AC-71):
 * the department can't edit it any more. Runs once, then refreshes the page.
 */
export function StartReview({ start }: { start: () => Promise<boolean> }) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void start().then((moved) => {
      if (moved) router.refresh();
    });
  }, [start, router]);
  return null;
}
