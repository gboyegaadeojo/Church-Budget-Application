import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/annual");

export default function Page() {
  return <ComingSoon href="/annual" />;
}
