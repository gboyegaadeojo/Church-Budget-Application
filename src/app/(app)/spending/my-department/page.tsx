import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const metadata = comingSoonMetadata("/spending/my-department");

export default function Page() {
  return <ComingSoon href="/spending/my-department" />;
}
