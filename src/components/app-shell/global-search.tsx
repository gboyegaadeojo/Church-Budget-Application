"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { searchAction } from "@/app/actions/search";
import { inputClass } from "@/components/ui/styles";
import { copy } from "@/copy/en-CA";
import type { SearchGroup, SearchResult } from "@/domain/search";
import { cn } from "@/lib/cn";

const s = copy.search;
const GROUPS: SearchGroup[] = ["budgets", "departments", "people", "pages"];

/** Whether a key press happened while typing, so "/" types a slash there. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Global search (DRD 6.0): "/" or Ctrl/Cmd + K opens it. A combobox: arrow keys move
 * through the grouped results, Enter opens one, Escape closes and returns focus.
 * The server decides what the person may find.
 */
export function GlobalSearch() {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((k === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing(e.target))) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      const found = await searchAction(q).catch(() => [] as SearchResult[]);
      if (ticket !== latest.current) return;
      setResults(found);
      setActive(0);
      setBusy(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const shown = query.trim().length >= 2 ? results : [];
  const ordered = GROUPS.flatMap((g) => shown.filter((r) => r.group === g));
  const go = (r: SearchResult | undefined) => {
    if (!r) return;
    setOpen(false);
    router.push(r.href);
  };
  const optionId = (i: number) => `${id}-option-${i}`;
  const status =
    query.trim().length < 2
      ? s.tooShort
      : busy
        ? s.searching
        : ordered.length === 0
          ? s.none
          : s.count(ordered.length);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setResults([]);
        }
      }}
    >
      <Dialog.Trigger className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 text-sm text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-fg lg:min-h-10">
        <Search className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{s.open}</span>
        <kbd
          aria-hidden="true"
          className="hidden rounded border border-border px-1.5 text-xs lg:inline"
        >
          /
        </kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          // Typing starts straight away, as "/" promises.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
          className="fixed inset-x-4 top-[10dvh] z-(--z-overlay) mx-auto max-w-xl rounded-dialog border border-border bg-surface text-fg shadow-overlay data-[state=open]:animate-pop-in"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <Dialog.Title className="text-base font-semibold">{s.title}</Dialog.Title>
            <Dialog.Close
              aria-label={s.close}
              className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface-hover hover:text-fg"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="px-4 text-xs text-fg-muted">{s.hint}</Dialog.Description>
          <div className="p-4">
            <label htmlFor={`${id}-input`} className="sr-only">
              {s.label}
            </label>
            <input
              ref={input}
              id={`${id}-input`}
              type="search"
              role="combobox"
              aria-expanded={ordered.length > 0}
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={ordered.length > 0 ? optionId(active) : undefined}
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, ordered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(ordered[active]);
                }
              }}
              className={inputClass}
            />
            <p role="status" className="mt-2 text-xs text-fg-muted">
              {status}
            </p>
          </div>
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label={s.label}
            className="max-h-[50dvh] overflow-y-auto px-2 pb-3"
          >
            {GROUPS.map((g) => {
              const inGroup = ordered.filter((r) => r.group === g);
              if (inGroup.length === 0) return null;
              return (
                <div key={g} role="group" aria-labelledby={`${id}-${g}`} className="pb-2">
                  <p
                    id={`${id}-${g}`}
                    role="presentation"
                    className="px-2 py-1 text-xs font-semibold text-fg-muted"
                  >
                    {s.groups[g]}
                  </p>
                  {inGroup.map((r) => {
                    const i = ordered.indexOf(r);
                    return (
                      <div
                        key={`${r.group}-${r.href}-${r.label}`}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(r)}
                        className={cn(
                          "cursor-pointer rounded-control px-2 py-2 text-sm",
                          i === active && "bg-surface-hover",
                        )}
                      >
                        <span className="block font-medium">{r.label}</span>
                        {r.detail && (
                          <span className="block text-xs text-fg-muted">{r.detail}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
