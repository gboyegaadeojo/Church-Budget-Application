"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClass, compactButtonClass } from "@/components/ui/styles";
import { homeCopy } from "@/copy/home";
import type { AccountantInbox } from "@/domain/home/dashboards";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";

const i = homeCopy.accountantHome.inbox;

type Tab = "expenses" | "budgets" | "messages";

/**
 * The accountant's decision inbox (Idea 6, decided by the church 2026-11-07): expenses,
 * next year's budgets and unread messages, one tab each. Each row opens the review screen,
 * where the decision itself is made.
 */
export function DecisionInbox({ inbox }: { inbox: AccountantInbox }) {
  const [tab, setTab] = useState<Tab>(
    inbox.expenses.length > 0 ? "expenses" : inbox.budgets.length > 0 ? "budgets" : "expenses",
  );
  const tabs: { id: Tab; label: string }[] = [
    { id: "expenses", label: i.expenses(inbox.expenses.length) },
    { id: "budgets", label: i.budgets(inbox.budgets.length) },
    { id: "messages", label: i.messages(inbox.messages.length) },
  ];
  return (
    <section
      aria-labelledby="inbox-heading"
      className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
    >
      <h2
        id="inbox-heading"
        className="px-5 pt-5 text-[17px] leading-tight font-semibold tracking-tight sm:px-6"
      >
        {i.heading}
      </h2>
      <div
        role="tablist"
        aria-labelledby="inbox-heading"
        className="flex gap-1 overflow-x-auto border-b border-border px-4 pt-3 sm:px-5"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`inbox-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`inbox-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-9 shrink-0 cursor-pointer border-b-2 px-3 text-[13px] font-semibold whitespace-nowrap",
              tab === t.id ? "border-accent text-accent" : "border-transparent text-fg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`inbox-panel-${tab}`} aria-labelledby={`inbox-tab-${tab}`}>
        {tab === "expenses" &&
          (inbox.expenses.length === 0 ? (
            <Empty text={i.emptyExpenses} />
          ) : (
            <ul>
              {inbox.expenses.map((e) => (
                <Row
                  key={e.id}
                  title={`${e.referenceNumber} · ${e.department} · ${e.title}`}
                  detail={`${i.types[e.type as keyof typeof i.types] ?? e.type} · ${i.waiting(e.daysWaiting)}`}
                  warning={e.overBy > 0 ? i.overBudget(formatCAD(e.overBy)) : undefined}
                  amount={formatCAD(e.amountCents)}
                  href={`/expenses/review/${e.id}`}
                  action={i.review}
                />
              ))}
            </ul>
          ))}
        {tab === "budgets" &&
          (inbox.budgets.length === 0 ? (
            <Empty text={i.emptyBudgets} />
          ) : (
            <ul>
              {inbox.budgets.map((b) => (
                <Row
                  key={b.id}
                  title={`${b.referenceNumber} · ${b.department}`}
                  detail={`${b.title} · ${b.requester}`}
                  amount={formatCAD(b.requestedTotalCents)}
                  href={`/annual/review/${b.id}`}
                  action={i.review}
                />
              ))}
            </ul>
          ))}
        {tab === "messages" &&
          (inbox.messages.length === 0 ? (
            <Empty text={i.emptyMessages} />
          ) : (
            <ul>
              {inbox.messages.map((m) => (
                <Row
                  key={m.id}
                  title={`${m.referenceNumber} · ${m.department}`}
                  detail={i.unread(m.unread)}
                  href={`/annual/review/${m.id}`}
                  action={i.open}
                />
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-6 text-sm text-fg-muted sm:px-6">{text}</p>;
}

function Row({
  title,
  detail,
  warning,
  amount,
  href,
  action,
}: {
  title: string;
  detail: string;
  warning?: string;
  amount?: string;
  href: string;
  action: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-3 last:border-b-0 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-fg-muted">
          {detail}
          {warning && <span className="font-semibold text-warning"> · {warning}</span>}
        </p>
      </div>
      {amount && <span className="tabular text-sm font-semibold">{amount}</span>}
      <Link href={href} className={buttonClass("primary", compactButtonClass)}>
        {action}
      </Link>
    </li>
  );
}
