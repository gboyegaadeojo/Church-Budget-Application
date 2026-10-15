import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/expenses/review");

export default function Page() {
  return <ComingSoon href="/expenses/review" />;
}
