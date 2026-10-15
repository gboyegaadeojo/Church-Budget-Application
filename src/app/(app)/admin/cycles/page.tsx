import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/admin/cycles");

export default function Page() {
  return <ComingSoon href="/admin/cycles" />;
}
