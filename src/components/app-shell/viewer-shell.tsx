import "server-only";
import { navigationFor } from "@/domain/navigation";
import { roleChips } from "@/domain/users/role-chips";
import { hasRole } from "@/lib/roles";
import { getViewer } from "@/lib/viewer";
import { AccountMenu } from "./account-menu";
import { BottomBar } from "./bottom-bar";
import { Brand } from "./brand";
import { Sidebar } from "./sidebar";

/*
 * The parts of the shell that depend on who is signed in. Each reads the viewer at
 * request time, so the (app) layout renders them inside <Suspense> boundaries.
 */

export async function ViewerSidebar() {
  const viewer = await getViewer();
  return <Sidebar areas={navigationFor(viewer.roles)} />;
}

export async function ViewerBottomBar() {
  const viewer = await getViewer();
  return <BottomBar areas={navigationFor(viewer.roles)} />;
}

export async function ViewerAccountMenu() {
  const viewer = await getViewer();
  return (
    <AccountMenu
      name={viewer.name}
      email={viewer.email}
      roleChips={roleChips(viewer)}
      canBeAway={hasRole(viewer, "accountant", "board_chair", "vice_chair")}
    />
  );
}

/** Static stand-in for the sidebar while the viewer loads; same width so nothing shifts. */
export function SidebarFallback() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-surface lg:block"
    >
      <div className="flex h-16 items-center px-4">
        <Brand />
      </div>
    </div>
  );
}

/** Placeholder the size of the account button, so the header does not jump. */
export function AccountMenuFallback() {
  return <span aria-hidden="true" className="block size-11 rounded-full bg-surface-2 lg:size-10" />;
}
