import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/spending/budget-vs-actual");

export default function Page() {
  return <ComingSoon href="/spending/budget-vs-actual" />;
}
