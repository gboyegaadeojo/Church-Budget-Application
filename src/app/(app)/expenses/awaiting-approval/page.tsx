import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/expenses/awaiting-approval");

export default function Page() {
  return <ComingSoon href="/expenses/awaiting-approval" />;
}
