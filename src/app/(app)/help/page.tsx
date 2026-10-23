import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminSkeleton, PageHeader, Section } from "@/components/ui/display";
import { cardClass } from "@/components/ui/styles";
import { helpCopy, type HelpGuide } from "@/copy/help";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/roles";
import { getViewer } from "@/lib/viewer";
import { MyInfoForm } from "./my-info-form";
import { OpenFromHash } from "./open-from-hash";
import { ChevronRight } from "lucide-react";

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

/**
 * Help (FR-36, DRD 6.11c): the common questions by topic, guides for your roles, then the
 * rest. Each question opens in place; a link to #its-id opens it.
 */
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

      <nav aria-label={h.faqHeading} className={cn(cardClass, "space-y-3")}>
        <h2 className="text-lg font-semibold">{h.faqHeading}</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {h.faqGroups.map((group) => (
            <li key={group.id}>
              <Link
                href={`#faq-${group.id}`}
                className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3.5 font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg motion-reduce:transition-none"
              >
                {group.title}
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

      <Section title={h.faqHeading} description={h.faqIntro} id="faq">
        <OpenFromHash />
        <div className="space-y-8">
          {h.faqGroups.map((group) => (
            <section
              key={group.id}
              id={`faq-${group.id}`}
              aria-labelledby={`faq-${group.id}-title`}
              className="scroll-mt-24"
            >
              <h3
                id={`faq-${group.id}-title`}
                className="mb-2 text-sm font-semibold tracking-wide text-fg-muted uppercase"
              >
                {group.title}
              </h3>
              <div className="divide-y divide-border overflow-hidden rounded-[14px] border border-border">
                {h.topics
                  .filter((t) => t.group === group.id)
                  .map((t) => (
                    <details key={t.id} id={t.id} className="group scroll-mt-24">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 font-medium transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1">{t.question}</span>
                        <ChevronRight
                          className="size-4 shrink-0 text-fg-muted transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed">
                        {t.answer.map((a) => (
                          <p key={a}>{a}</p>
                        ))}
                      </div>
                    </details>
                  ))}
              </div>
            </section>
          ))}
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
