import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/admin/settings");

export default function Page() {
  return <ComingSoon href="/admin/settings" />;
}
