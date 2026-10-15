import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/annual/departments");

export default function Page() {
  return <ComingSoon href="/annual/departments" />;
}
