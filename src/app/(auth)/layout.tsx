import { Brand } from "@/components/app-shell/live-brand";

/** Sign-in and access screens: one calm card, no navigation (DRD 6.1, 6.1a). */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Brand />
        </div>
        <div className="rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
