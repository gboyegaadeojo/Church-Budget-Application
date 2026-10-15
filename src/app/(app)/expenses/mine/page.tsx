import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/expenses/mine");

export default function Page() {
  return <ComingSoon href="/expenses/mine" />;
}
