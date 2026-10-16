"use client";

import { useRef } from "react";
import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useTheme } from "next-themes";
import { Check, LogOut, Monitor, Moon, Plane, Sun } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { copy } from "@/copy/en-CA";

const a = copy.account;

const THEMES = [
  { value: "light", label: a.themeLight, Icon: Sun },
  { value: "dark", label: a.themeDark, Icon: Moon },
  { value: "system", label: a.themeSystem, Icon: Monitor },
] as const;

export type AccountMenuProps = {
  name: string;
  email: string;
  /** Pre-built labels such as "Accountant" or "Requester: Media". */
  roleChips: string[];
  /** Away applies to the accountant and backup approvers (FR-33); the board's comes with expenses. */
  canBeAway: boolean;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

const itemClass =
  "flex min-h-11 cursor-default select-none items-center gap-3 rounded-control px-3 text-sm outline-none data-[disabled]:text-fg-muted data-[highlighted]:bg-surface-hover lg:min-h-9";

/**
 * Account menu (DRD 6.0): roles as chips, theme choice, Away, and sign out. No role
 * switcher. There are no email preferences: every email always goes (docs/decisions.md).
 */
export function AccountMenu({ name, email, roleChips, canBeAway }: AccountMenuProps) {
  const { theme, setTheme } = useTheme();
  // Sign out posts this form, which lives outside the menu so it survives the menu closing.
  const signOutForm = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={signOutForm} action={signOutAction} hidden />
      {/* Non-modal: a modal menu aria-hides the page while its links stay focusable (axe aria-hidden-focus). */}
      <Menu.Root modal={false}>
        <Menu.Trigger
          aria-label={a.openMenu}
          className="grid size-11 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent transition-colors duration-fast hover:bg-surface-hover lg:size-10"
        >
          <span aria-hidden="true">{initials(name)}</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={8}
            collisionPadding={16}
            className="z-(--z-overlay) max-h-(--radix-dropdown-menu-content-available-height) w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-card border border-border bg-surface p-2 text-fg shadow-overlay"
          >
            {/* Plain divs and spans only: a role="menu" may not contain lists or paragraphs. */}
            <div className="px-3 py-2">
              <span className="block truncate font-semibold">{name}</span>
              <span className="block truncate text-sm text-fg-muted">{email}</span>
            </div>

            <Menu.Label className="px-3 pt-2 text-xs font-medium text-fg-muted">
              {a.yourRoles}
            </Menu.Label>
            <div className="flex flex-wrap gap-1.5 px-3 pt-1.5 pb-2">
              {roleChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-fg"
                >
                  {chip}
                </span>
              ))}
            </div>

            <Menu.Separator className="my-1 h-px bg-border" />

            <Menu.Label className="px-3 pt-2 pb-1 text-xs font-medium text-fg-muted">
              {a.theme}
            </Menu.Label>
            <Menu.RadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              {THEMES.map(({ value, label, Icon }) => (
                <Menu.RadioItem
                  key={value}
                  value={value}
                  className={itemClass}
                  onSelect={(event) => event.preventDefault()}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  <Menu.ItemIndicator>
                    <Check className="size-4 text-accent" aria-hidden="true" />
                  </Menu.ItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>

            <Menu.Separator className="my-1 h-px bg-border" />

            {canBeAway && (
              <Menu.Item asChild className={itemClass}>
                <Link href="/account#away">
                  <Plane className="size-4" aria-hidden="true" />
                  <span className="flex-1">{a.away}</span>
                </Link>
              </Menu.Item>
            )}
            <Menu.Item className={itemClass} onSelect={() => signOutForm.current?.requestSubmit()}>
              <LogOut className="size-4" aria-hidden="true" />
              <span className="flex-1">{a.signOut}</span>
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
