import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/spending/ledger");

export default function Page() {
  return <ComingSoon href="/spending/ledger" />;
}
