import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/expenses/all");

export default function Page() {
  return <ComingSoon href="/expenses/all" />;
}
