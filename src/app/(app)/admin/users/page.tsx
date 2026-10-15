import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/admin/users");

export default function Page() {
  return <ComingSoon href="/admin/users" />;
}
