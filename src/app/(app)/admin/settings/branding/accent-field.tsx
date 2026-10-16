"use client";

import { useId, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useFieldError } from "@/components/ui/action-form";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { brandingCopy } from "@/copy/branding";
import { accentPalette, checkAccent, DEFAULT_ACCENT, type ThemePalette } from "@/lib/brand-colour";

const t = brandingCopy.accent;

/** A sample button and link on one theme's surface, painted with that theme's tokens. */
function Sample({
  label,
  palette,
  surface,
  fg,
}: {
  label: string;
  palette: ThemePalette;
  surface: string;
  fg: string;
}) {
  return (
    <div
      className="space-y-3 rounded-card border border-border p-4"
      style={{ background: surface, color: fg }}
    >
      <p className="text-xs font-medium tracking-wide uppercase">{label}</p>
      <span
        className="inline-flex min-h-10 items-center rounded-control px-4 text-sm font-medium"
        style={{ background: palette.accent, color: palette.onAccent }}
      >
        {t.sampleButton}
      </span>
      <p className="text-sm">
        <span
          className="font-medium underline underline-offset-4"
          style={{ color: palette.accent }}
        >
          {t.sampleLink}
        </span>
      </p>
      <span
        className="inline-flex rounded-full px-3 py-1 text-xs font-medium"
        style={{ background: palette.soft, color: palette.accent }}
      >
        {brandingCopy.title}
      </span>
    </div>
  );
}

/**
 * The accent colour with a live preview and contrast check (DRD 3.8, AC-100). The check
 * here only guides; the server runs the same check and refuses a failing colour.
 */
export function AccentField({ initial }: { initial: string }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const error = useFieldError("accent");
  const check = checkAccent(value);
  const palette = check.ok ? check.palette : accentPalette(DEFAULT_ACCENT);
  const pickerValue = check.ok || check.reason === "contrast" ? check.hex : DEFAULT_ACCENT;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-text`} className="block text-sm font-medium">
          {t.label}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t.picker}
            value={pickerValue}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            className="h-11 w-14 shrink-0 cursor-pointer rounded-control border border-border-strong bg-surface p-1 lg:h-9"
          />
          <input
            id={`${id}-text`}
            name="accent"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={[`${id}-hint`, `${id}-check`, error && `${id}-error`]
              .filter(Boolean)
              .join(" ")}
            className={`${inputClass} max-w-40 font-mono uppercase`}
          />
        </div>
        <p id={`${id}-hint`} className="text-xs text-fg-muted">
          {t.hint}
        </p>
        {error && (
          <p id={`${id}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div id={`${id}-check`} aria-live="polite" className="text-sm">
        {check.ok ? (
          <p className="flex items-center gap-2 text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {check.hex === DEFAULT_ACCENT ? t.isDefault : t.passes(check.contrast.toFixed(1))}
          </p>
        ) : check.reason === "contrast" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-warning">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {t.fails(check.contrast.toFixed(1))}
            </p>
            <button
              type="button"
              className={buttonClass("secondary")}
              onClick={() => setValue(check.suggestion.toUpperCase())}
            >
              <span
                aria-hidden="true"
                className="size-4 rounded-full border border-border"
                style={{ background: check.suggestion }}
              />
              {t.useSuggestion(check.suggestion.toUpperCase())}
            </button>
          </div>
        ) : (
          <p className="text-fg-muted">{brandingCopy.errors.accentInvalid}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t.preview}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Sample label={t.light} palette={palette.light} surface="#ffffff" fg="#18181b" />
          <Sample label={t.dark} palette={palette.dark} surface="#101014" fg="#f5f5f7" />
        </div>
      </div>
    </div>
  );
}
