import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/expenses/new");

export default function Page() {
  return <ComingSoon href="/expenses/new" />;
}
