import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/expenses/ready");

export default function Page() {
  return <ComingSoon href="/expenses/ready" />;
}
