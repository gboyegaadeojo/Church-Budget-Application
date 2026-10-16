import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, brandAssets, userRoles } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { annualWorkbook } from "@/lib/excel/annual-workbook";
import { emailBrand } from "@/domain/notifications/notice";
import { brandAssetBytes, getBrand, rasterLogo } from "@/domain/settings/brand";
import {
  removeBrandImage,
  resetAccentColour,
  updateAccentColour,
  updateBrandNames,
  uploadBrandImage,
} from "@/domain/settings/brand-service";
import { settingVersions } from "@/domain/settings/service";
import { ValidationError } from "@/domain/errors";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { renderEmail } from "@/lib/email/layout";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

/* Branding (FR-30, AC-99 to AC-101, AC-138). */

let t: TestDb;
let db: Db;
let admin: Subject;
let pat: Subject;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(role: Role): Promise<Subject> {
  const row = await insertUser(db, { accessStatus: "active" });
  await db.insert(userRoles).values({ userId: row.id, role });
  return { id: row.id, roles: [role], departments: [] };
}

/** A 1×1 transparent PNG, 400 wide by 100 high in its header. */
function png(width = 400, height = 100): Uint8Array {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return new Uint8Array(bytes);
}

const versions = (keys: Parameters<typeof settingVersions>[1]) =>
  run((tx) => settingVersions(tx, keys));

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  pat = await person("accountant");
});

afterAll(async () => {
  await t?.close();
});

describe("branding (FR-30)", () => {
  it("starts with the defaults", async () => {
    const brand = await run((tx) => getBrand(tx));
    expect(brand).toMatchObject({
      churchName: "Immanuel Fellowship Church",
      accent: null,
      palette: null,
      logo: null,
      icon: null,
    });
  });

  it("AC-101 only the System Administrator changes it", async () => {
    await expect(
      run(async (tx) =>
        uploadBrandImage(tx, pat, {
          kind: "logo",
          bytes: png(),
          versions: await settingVersions(tx, ["logo_asset_id"]),
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      run((tx) => updateAccentColour(tx, pat, { accent: "#2860c0", versions: {} })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("AC-99 AC-138 a new logo, names and colour show in the app, emails and exports", async () => {
    const { id } = await run(async (tx) =>
      uploadBrandImage(tx, admin, {
        kind: "logo",
        bytes: png(),
        versions: await settingVersions(tx, ["logo_asset_id"]),
      }),
    );
    await run(async (tx) =>
      updateBrandNames(tx, admin, {
        churchName: "Immanuel Fellowship",
        appName: "IFC Budgets",
        versions: await settingVersions(tx, ["church_name", "app_name"]),
      }),
    );
    await run(async (tx) =>
      updateAccentColour(tx, admin, {
        accent: "#2860C0",
        versions: await settingVersions(tx, ["accent_color"]),
      }),
    );

    const brand = await run((tx) => getBrand(tx));
    expect(brand).toMatchObject({
      churchName: "Immanuel Fellowship",
      appName: "IFC Budgets",
      accent: "#2860c0",
      logo: { id, contentType: "image/png", width: 400, height: 100, path: `/brand/asset/${id}` },
    });
    expect(brand.palette?.light.accent).toBe("#2860c0");
    const asset = await run((tx) => brandAssetBytes(tx, id));
    expect(asset?.contentType).toBe("image/png");

    // Emails: the logo above the names, the accent on the button.
    const mailBrand = await run((tx) => emailBrand(tx));
    expect(mailBrand.logoUrl).toMatch(new RegExp(`/brand/asset/${id}$`));
    const html = renderEmail(
      {
        subject: "S",
        heading: "H",
        status: "Approved",
        action: "Nothing",
        button: { label: "Open", href: "https://app.example/x" },
      },
      mailBrand,
    ).html;
    expect(html).toContain(`src="${mailBrand.logoUrl}"`);
    expect(html).toContain('alt="Immanuel Fellowship"');
    expect(html).toContain("background:#2860c0");

    // Excel: the logo is in the workbook.
    const logo = await run((tx) => rasterLogo(tx, brand));
    expect(logo).toMatchObject({ extension: "png", width: 400, height: 100 });
    const book = await annualWorkbook({
      brand: mailBrand,
      logo,
      generatedAt: new Date(),
      zone: "America/Winnipeg",
      cycle: { id: "c", name: "FY2027", budgetYear: 2027 },
      filterLabels: [],
      single: false,
      fileName: "x.xlsx",
      requests: [],
    });
    expect(book.includes(Buffer.from("xl/media/image"))).toBe(true);

    const audits = await db
      .select({ type: auditEvents.eventType })
      .from(auditEvents)
      .where(
        sql`${auditEvents.eventType} like 'admin.%' and ${auditEvents.actorUserId} = ${admin.id}`,
      );
    expect(audits.map((a) => a.type)).toEqual(
      expect.arrayContaining(["admin.logo_uploaded", "admin.branding_changed"]),
    );
  });

  it("AC-100 refuses a colour that fails contrast and names a passing one", async () => {
    const error = await run(async (tx) =>
      updateAccentColour(tx, admin, {
        accent: "#FFD400",
        versions: await settingVersions(tx, ["accent_color"]),
      }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors.accent).toMatch(/Try #[0-9A-F]{6}\./);
    expect((await run((tx) => getBrand(tx))).accent).toBe("#2860c0");
  });

  it("a reset brings back the default colour, and removing the logo keeps its file", async () => {
    await run(async (tx) =>
      resetAccentColour(tx, admin, { versions: await settingVersions(tx, ["accent_color"]) }),
    );
    const before = await run((tx) => getBrand(tx));
    await run(async (tx) =>
      removeBrandImage(tx, admin, {
        kind: "logo",
        versions: await settingVersions(tx, ["logo_asset_id"]),
      }),
    );
    const after = await run((tx) => getBrand(tx));
    expect(after).toMatchObject({ accent: null, palette: null, logo: null });
    expect(await run((tx) => brandAssetBytes(tx, before.logo!.id))).not.toBeNull();
  });

  it("refuses files that aren't images, unsafe SVGs and a non-square icon", async () => {
    const upload = (kind: "logo" | "icon", bytes: Uint8Array | null) =>
      run(async (tx) =>
        uploadBrandImage(tx, admin, {
          kind,
          bytes,
          versions: await settingVersions(tx, [
            kind === "logo" ? "logo_asset_id" : "icon_asset_id",
          ]),
        }),
      );
    const text = (s: string) => new TextEncoder().encode(s);
    await expect(upload("logo", null)).rejects.toBeInstanceOf(ValidationError);
    await expect(upload("logo", text("%PDF-1.4"))).rejects.toBeInstanceOf(ValidationError);
    await expect(upload("logo", text('<svg onload="x()"></svg>'))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(upload("icon", png(400, 100))).rejects.toBeInstanceOf(ValidationError);
    await upload("icon", png(180, 180));
    expect((await run((tx) => getBrand(tx))).icon).toMatchObject({ width: 180, height: 180 });
  });

  it("stored files can't be changed or deleted", async () => {
    const [row] = await db.select({ id: brandAssets.id }).from(brandAssets).limit(1);
    await expect(
      db.update(brandAssets).set({ byteSize: 1 }).where(eq(brandAssets.id, row.id)),
    ).rejects.toThrow();
    await expect(db.delete(brandAssets).where(eq(brandAssets.id, row.id))).rejects.toThrow();
  });

  it("two administrators can't overwrite each other", async () => {
    const stale = await versions(["church_name", "app_name"]);
    await run((tx) =>
      updateBrandNames(tx, admin, { churchName: "A", appName: "B", versions: stale }),
    );
    await expect(
      run((tx) => updateBrandNames(tx, admin, { churchName: "C", appName: "D", versions: stale })),
    ).rejects.toThrow();
  });
});
