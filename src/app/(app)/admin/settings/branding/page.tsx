import { AppWindow, Image as ImageIcon, Palette, Type } from "lucide-react";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ActionForm, FileField, SubmitButton, TextField } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AdminSkeleton, PageHeader, PermissionDenied, Section } from "@/components/ui/display";
import { brandingCopy } from "@/copy/branding";
import { getDb } from "@/db";
import { getBrand, type BrandImage } from "@/domain/settings/brand";
import { settingVersions } from "@/domain/settings/service";
import { viewerAllowedTo } from "@/lib/admin-server";
import { DEFAULT_ACCENT } from "@/lib/brand-colour";
import { AccentField } from "./accent-field";
import {
  accentAction,
  brandNamesAction,
  removeImageAction,
  resetAccentAction,
  uploadImageAction,
} from "./actions";

const b = brandingCopy;

export const metadata: Metadata = { title: b.title };

/**
 * Admin → Settings → Branding (FR-30, DRD 3.8 and 6.11): logo, icon, names and accent
 * colour, for the System Administrator only (AC-101). The only page that takes a file.
 */
export default function BrandingPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <BrandingContent />
      </Suspense>
    </div>
  );
}

function ImagePreview({
  image,
  alt,
  square,
}: {
  image: BrandImage;
  alt: string;
  square?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* The logo on both themes' surfaces, so a dark logo on a dark sidebar shows up. */}
      {["#ffffff", "#101014"].map((bg) => (
        <div
          key={bg}
          className="grid h-24 place-items-center rounded-card border border-border p-3"
          style={{ background: bg }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a stored upload */}
          <img
            src={image.path}
            alt={bg === "#ffffff" ? alt : ""}
            className={square ? "size-16 object-contain" : "max-h-16 max-w-full object-contain"}
          />
        </div>
      ))}
    </div>
  );
}

function ImageSection({
  kind,
  image,
  versions,
  churchName,
}: {
  kind: "logo" | "icon";
  image: BrandImage | null;
  versions: Record<string, number>;
  churchName: string;
}) {
  const t = kind === "logo" ? b.logo : b.icon;
  const accept = kind === "logo" ? "image/png,image/jpeg,image/svg+xml" : "image/png,image/svg+xml";
  return (
    <Section
      title={t.heading}
      description={t.intro}
      id={kind}
      icon={kind === "logo" ? ImageIcon : AppWindow}
      tone={kind === "logo" ? "pink" : "teal"}
    >
      {image ? (
        <ImagePreview image={image} alt={b.logo.alt(churchName)} square={kind === "icon"} />
      ) : (
        <p className="text-sm text-fg-muted">{t.none}</p>
      )}
      <ActionForm action={uploadImageAction} aria-label={t.upload} resetOnSuccess>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="versions" value={JSON.stringify(versions)} />
        <div className="max-w-md">
          <FileField name={kind} label={t.file} accept={accept} required />
        </div>
        <SubmitButton tone="secondary">
          {kind === "logo" && image ? b.logo.replace : t.upload}
        </SubmitButton>
      </ActionForm>
      {image && (
        <ActionForm action={removeImageAction} id={`remove-${kind}`} aria-label={t.remove}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="versions" value={JSON.stringify(versions)} />
          <ConfirmDialog
            formId={`remove-${kind}`}
            trigger={t.remove}
            triggerTone="ghost"
            title={t.removeTitle}
            body={t.removeBody}
            confirmLabel={t.remove}
            confirmTone="danger"
          />
        </ActionForm>
      )}
    </Section>
  );
}

async function BrandingContent() {
  const viewer = await viewerAllowedTo("admin.branding", "/admin/settings/branding");
  if (!viewer) return <PermissionDenied />;
  const db = getDb();
  const [brand, nameVersions, accentVersions, logoVersions, iconVersions] = await Promise.all([
    getBrand(db),
    settingVersions(db, ["church_name", "app_name"]),
    settingVersions(db, ["accent_color"]),
    settingVersions(db, ["logo_asset_id"]),
    settingVersions(db, ["icon_asset_id"]),
  ]);

  return (
    <>
      <PageHeader title={b.title} intro={b.intro} />

      <ImageSection
        kind="logo"
        image={brand.logo}
        versions={logoVersions}
        churchName={brand.churchName}
      />

      <Section title={b.names.heading} id="names" icon={Type} tone="blue">
        <ActionForm action={brandNamesAction} aria-label={b.names.heading}>
          <input type="hidden" name="versions" value={JSON.stringify(nameVersions)} />
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <TextField
              name="churchName"
              label={b.names.churchName}
              defaultValue={brand.churchName}
              required
            />
            <TextField
              name="appName"
              label={b.names.appName}
              hint={b.names.appNameHint}
              defaultValue={brand.appName}
              required
            />
          </div>
          <SubmitButton tone="secondary">{b.names.save}</SubmitButton>
        </ActionForm>
      </Section>

      <Section
        title={b.accent.heading}
        description={b.accent.intro}
        id="accent"
        icon={Palette}
        tone="violet"
      >
        <ActionForm action={accentAction} aria-label={b.accent.heading}>
          <input type="hidden" name="versions" value={JSON.stringify(accentVersions)} />
          <AccentField initial={(brand.accent ?? DEFAULT_ACCENT).toUpperCase()} />
          <SubmitButton tone="secondary">{b.accent.save}</SubmitButton>
        </ActionForm>
        {brand.accent && brand.accent !== DEFAULT_ACCENT && (
          <ActionForm action={resetAccentAction} id="reset-accent" aria-label={b.accent.reset}>
            <input type="hidden" name="versions" value={JSON.stringify(accentVersions)} />
            <ConfirmDialog
              formId="reset-accent"
              trigger={b.accent.reset}
              triggerTone="ghost"
              title={b.accent.resetTitle}
              body={b.accent.resetBody}
              confirmLabel={b.accent.reset}
            />
          </ActionForm>
        )}
      </Section>

      <ImageSection
        kind="icon"
        image={brand.icon}
        versions={iconVersions}
        churchName={brand.churchName}
      />
    </>
  );
}
