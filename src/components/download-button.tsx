"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { buttonClass, type ButtonTone } from "@/components/ui/styles";
import { exportsCopy } from "@/copy/exports";
import { cn } from "@/lib/cn";

const d = exportsCopy.download;

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; file: string }
  | { kind: "error"; message: string };

/** The file name the server chose (Content-Disposition), or a plain fallback. */
function fileNameOf(response: Response): string {
  const header = response.headers.get("Content-Disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? "export.xlsx";
}

/**
 * Downloads an Excel workbook from an export route, showing progress while it's made and
 * a clear success or failure message (DRD 6.10). The server checks permission again.
 */
export function DownloadButton({
  href,
  label = d.request,
  ariaLabel,
  tone = "secondary",
  className,
}: {
  href: string;
  label?: string;
  ariaLabel?: string;
  tone?: ButtonTone;
  className?: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function download() {
    setState({ kind: "busy" });
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setState({ kind: "error", message: body?.message ?? d.failed });
        return;
      }
      const file = fileNameOf(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = file;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ kind: "done", file });
    } catch {
      setState({ kind: "error", message: d.failed });
    }
  }

  const busy = state.kind === "busy";
  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={ariaLabel}
        className={buttonClass(tone)}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <FileSpreadsheet className="size-4" aria-hidden="true" />
        )}
        {label}
      </button>
      <span role="status" className="text-xs">
        {busy && <span className="text-fg-muted">{d.preparing}</span>}
        {state.kind === "done" && (
          <span className="inline-flex items-center gap-1 text-success">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {d.done(state.file)}
          </span>
        )}
      </span>
      {state.kind === "error" && (
        <span role="alert" className="inline-flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="size-3.5" aria-hidden="true" />
          {state.message}
        </span>
      )}
    </span>
  );
}
