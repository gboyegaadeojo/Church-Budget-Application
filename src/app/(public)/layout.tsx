import Link from "next/link";
import { Brand } from "@/components/app-shell/brand";

/** Pages anyone can read without signing in (the privacy notice, FR-36). */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="min-h-dvh bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link href="/" className="inline-flex rounded-control">
          <Brand />
        </Link>
        <div className="rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
