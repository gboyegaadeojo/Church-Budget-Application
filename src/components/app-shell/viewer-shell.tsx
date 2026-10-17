import "server-only";
import { navigationFor } from "@/domain/navigation";
import { roleChips } from "@/domain/users/role-chips";
import { hasRole } from "@/lib/roles";
import { getViewerAllowingWaiting as getViewer } from "@/lib/viewer";
import { AccountMenu } from "./account-menu";
import { BottomBar } from "./bottom-bar";
import { Brand, currentBrandView } from "./live-brand";
import { Sidebar } from "./sidebar";

/*
 * The parts of the shell that depend on who is signed in. Each reads the viewer at
 * request time, so the (app) layout renders them inside <Suspense> boundaries.
 */

export async function ViewerSidebar() {
  const [viewer, brand] = await Promise.all([getViewer(), currentBrandView()]);
  return (
    <Sidebar
      areas={navigationFor(viewer.roles, {
        expenseSubmitter: (viewer.expenseDepartments?.length ?? 0) > 0,
      })}
      brand={brand}
    />
  );
}

export async function ViewerBottomBar() {
  const viewer = await getViewer();
  return (
    <BottomBar
      areas={navigationFor(viewer.roles, {
        expenseSubmitter: (viewer.expenseDepartments?.length ?? 0) > 0,
      })}
    />
  );
}

export async function ViewerAccountMenu() {
  const viewer = await getViewer();
  return (
    <AccountMenu
      name={viewer.name}
      email={viewer.email}
      roleChips={roleChips(viewer)}
      canBeAway={hasRole(viewer, "accountant", "backup_approver")}
    />
  );
}

/** Static stand-in for the sidebar while the viewer loads; same widths so nothing shifts. */
export function SidebarFallback() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-surface md:block md:w-[76px] lg:w-72 print:hidden"
    >
      <div className="flex h-16 items-center px-4">
        <Brand compact className="mx-auto lg:hidden" />
        <Brand className="hidden lg:flex" />
      </div>
    </div>
  );
}

/** Placeholder the size of the account button, so the header does not jump. */
export function AccountMenuFallback() {
  return <span aria-hidden="true" className="block size-11 rounded-full bg-surface-2 lg:size-10" />;
}
