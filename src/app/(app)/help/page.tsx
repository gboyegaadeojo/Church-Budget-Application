import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/help");

export default function Page() {
  return <ComingSoon href="/help" />;
}
