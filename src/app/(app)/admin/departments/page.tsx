import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/admin/departments");

export default function Page() {
  return <ComingSoon href="/admin/departments" />;
}
