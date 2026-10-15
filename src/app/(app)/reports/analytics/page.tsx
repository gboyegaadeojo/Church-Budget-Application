import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/reports/analytics");

export default function Page() {
  return <ComingSoon href="/reports/analytics" />;
}
