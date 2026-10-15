import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/spending/record");

export default function Page() {
  return <ComingSoon href="/spending/record" />;
}
