import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/reports");

export default function Page() {
  return <ComingSoon href="/reports" />;
}
