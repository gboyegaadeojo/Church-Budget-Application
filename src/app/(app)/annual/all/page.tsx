import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/annual/all");

export default function Page() {
  return <ComingSoon href="/annual/all" />;
}
