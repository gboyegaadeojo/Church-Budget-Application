"use server";

import { signIn, signOut } from "@/auth";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { rememberDeniedEmail } from "@/lib/denied-email";

/** Only same-site paths, so a crafted link can't send people elsewhere after sign-in. */
function safeRedirect(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "/";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

export async function signInWithProvider(formData: FormData) {
  const provider = formData.get("provider");
  if (provider !== "google" && provider !== "planningcenter") return;
  await signIn(provider, { redirectTo: safeRedirect(formData.get("callbackUrl")) });
}

export async function signInFake(formData: FormData) {
  if (!fakeSignInEnabled()) return;
  await signIn("fake", {
    provider: formData.get("provider"),
    subject: formData.get("subject"),
    email: formData.get("email"),
    name: formData.get("name"),
    organizationId: formData.get("organizationId"),
    redirectTo: safeRedirect(formData.get("callbackUrl")),
  });
}

export async function signOutAction() {
  await rememberDeniedEmail(null);
  await signOut({ redirectTo: "/sign-in" });
}
