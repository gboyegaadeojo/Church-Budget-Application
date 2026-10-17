"use client";

import { useId, useState } from "react";
import { DownloadButton } from "@/components/download-button";
import { inputClass } from "@/components/ui/styles";
import { exportsCopy } from "@/copy/exports";

const p = exportsCopy.page;

/** Spending export filters (FR-26 Export, DRD 6.10); the server checks them again. */
export function SpendingExportForm({
  cycles,
  departments,
  defaultCycleId,
}: {
  cycles: { id: string; label: string }[];
  departments: { id: string; name: string }[];
  defaultCycleId: string;
}) {
  const id = useId();
  const [cycle, setCycle] = useState(defaultCycleId);
  const [department, setDepartment] = useState("");
  const query = new URLSearchParams({ cycle });
  if (department) query.set("department", department);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-cycle`} className="block text-sm font-medium">
            {p.cycle}
          </label>
          <select
            id={`${id}-cycle`}
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            className={inputClass}
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-department`} className="block text-sm font-medium">
            {p.department}
          </label>
          <select
            id={`${id}-department`}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={inputClass}
          >
            <option value="">{p.allDepartments}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <DownloadButton href={`/api/exports/spending?${query}`} label={p.download} tone="primary" />
    </div>
  );
}
