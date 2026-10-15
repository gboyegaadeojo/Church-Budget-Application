import {
  CalendarRange,
  FileSpreadsheet,
  House,
  Receipt,
  Settings,
  Wallet,
  type LucideProps,
} from "lucide-react";
import type { AreaId } from "@/domain/navigation";

const ICONS = {
  home: House,
  annual: CalendarRange,
  expenses: Receipt,
  spending: Wallet,
  reports: FileSpreadsheet,
  admin: Settings,
} as const;

export function AreaIcon({ area, ...props }: { area: AreaId } & LucideProps) {
  const Icon = ICONS[area];
  return <Icon aria-hidden="true" {...props} />;
}
