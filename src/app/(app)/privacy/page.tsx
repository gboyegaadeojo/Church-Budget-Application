import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/privacy");

export default function Page() {
  return <ComingSoon href="/privacy" />;
}
