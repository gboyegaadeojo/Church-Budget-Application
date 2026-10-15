import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/admin/audit");

export default function Page() {
  return <ComingSoon href="/admin/audit" />;
}
