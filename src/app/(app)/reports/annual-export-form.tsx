"use client";

import { useId, useState } from "react";
import { DownloadButton } from "@/components/download-button";
import { inputClass } from "@/components/ui/styles";
import { exportsCopy } from "@/copy/exports";

const p = exportsCopy.page;

/** Annual budget export filters (DRD 6.10); the server checks them again. */
export function AnnualExportForm({
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
  const [status, setStatus] = useState("all");
  const query = new URLSearchParams({ cycle });
  if (department) query.set("department", department);
  if (status !== "all") query.set("status", status);

  const select = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-${key}`} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={`${id}-${key}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {select(
          "cycle",
          p.cycle,
          cycle,
          setCycle,
          cycles.map((c) => ({ value: c.id, label: c.label })),
        )}
        {select("department", p.department, department, setDepartment, [
          { value: "", label: p.allDepartments },
          ...departments.map((d) => ({ value: d.id, label: d.name })),
        ])}
        {select(
          "status",
          p.status,
          status,
          setStatus,
          Object.entries(exportsCopy.statusFilters).map(([value, label]) => ({ value, label })),
        )}
      </div>
      <DownloadButton href={`/api/exports/annual?${query}`} label={p.download} tone="primary" />
    </div>
  );
}
