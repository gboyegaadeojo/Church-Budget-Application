import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/annual/release");

export default function Page() {
  return <ComingSoon href="/annual/release" />;
}
