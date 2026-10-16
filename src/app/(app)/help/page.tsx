import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminSkeleton, PageHeader, Section } from "@/components/ui/display";
import { cardClass, linkClass } from "@/components/ui/styles";
import { helpCopy, type HelpGuide } from "@/copy/help";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/roles";
import { getViewer } from "@/lib/viewer";
import { MyInfoForm } from "./my-info-form";

const h = helpCopy;

export const metadata: Metadata = { title: h.title };

/** Which roles each guide is for. */
const GUIDE_ROLES: Record<string, readonly Role[]> = {
  requester: ["requester"],
  accountant: ["accountant", "backup_approver"],
  board_chair: ["board_chair", "vice_chair"],
  church_admin: ["church_admin"],
  system_admin: ["system_admin"],
};

/** Help (FR-36, DRD 6.11c): guides for your roles first, then the rest, and the FAQ. */
export default function HelpPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <HelpContent />
      </Suspense>
    </div>
  );
}

async function HelpContent() {
  const viewer = await getViewer();
  const mine = (g: HelpGuide) => GUIDE_ROLES[g.who].some((r) => viewer.roles.includes(r));
  const yours = h.guides.filter(mine);
  const others = h.guides.filter((g) => !mine(g));

  return (
    <>
      <PageHeader title={h.title} intro={h.intro} />

      <nav aria-label={h.faqHeading} className={cn(cardClass, "space-y-2")}>
        <h2 className="text-lg font-semibold">{h.faqHeading}</h2>
        <ul className="space-y-1 text-sm">
          {h.topics.map((t) => (
            <li key={t.id}>
              <Link href={`#${t.id}`} className={linkClass}>
                {t.question}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {yours.length > 0 && (
        <Section title={h.yourGuides} id="your-guides">
          <div className="space-y-6">
            {yours.map((g) => (
              <Guide key={g.id} guide={g} />
            ))}
          </div>
        </Section>
      )}

      <Section title={h.faqHeading} id="faq">
        <div className="space-y-6">
          {h.topics.map((t) => (
            <section key={t.id} id={t.id} aria-labelledby={`${t.id}-q`} className="scroll-mt-24">
              <h3 id={`${t.id}-q`} className="font-semibold">
                {t.question}
              </h3>
              <div className="mt-2 space-y-2 text-sm">
                {t.answer.map((a) => (
                  <p key={a}>{a}</p>
                ))}
              </div>
            </section>
          ))}
          <p className="text-sm text-fg-muted">{h.laterNote}</p>
        </div>
      </Section>

      {others.length > 0 && (
        <Section title={h.otherGuides} id="other-guides">
          <div className="space-y-3">
            {others.map((g) => (
              <details key={g.id} className="rounded-control border border-border p-3">
                <summary className="cursor-pointer font-medium">{g.title}</summary>
                <div className="mt-3">
                  <Steps steps={g.steps} />
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      <Section title={h.myInfo.heading} description={h.myInfo.intro} id="my-information">
        <MyInfoForm />
      </Section>
    </>
  );
}

function Guide({ guide }: { guide: HelpGuide }) {
  return (
    <section id={`guide-${guide.id}`} aria-labelledby={`guide-${guide.id}-title`}>
      <h3 id={`guide-${guide.id}-title`} className="font-semibold">
        {guide.title}
      </h3>
      <div className="mt-2">
        <Steps steps={guide.steps} />
      </div>
    </section>
  );
}

function Steps({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}
