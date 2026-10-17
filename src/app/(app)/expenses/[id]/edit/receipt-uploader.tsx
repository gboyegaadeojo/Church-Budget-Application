"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  FileText,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { buttonClass, linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { cn } from "@/lib/cn";
import { removeReceiptAction } from "../../actions";

const r = expensesCopy.receipts;
const e = expensesCopy.errors;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

export type ReceiptItem = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  duplicate: boolean;
};

type Status = { kind: "busy" | "done" | "error"; text: string } | null;

const isHeic = (file: File) => /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/** HEIC photos (iPhone) become JPG in the browser before upload (decided 2026-10-16). */
async function toUploadable(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
}

/** PUTs the file to the signed link, reporting progress. */
function put(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(typeof data.message === "string" ? data.message : e.receiptUploadFailed);
  return data;
}

/**
 * Receipts on a claim (DRD 6.9a, 6B.9): Take photo and Choose file, a drop zone on wider
 * screens, progress per file, and each file with View and Remove. The server checks
 * every file again; what's shown here comes from the server after each change.
 */
export function ReceiptUploader({
  expenseId,
  receipts,
  error,
  kind = "receipts",
}: {
  expenseId: string;
  receipts: ReceiptItem[];
  error?: string;
  /** A claim's receipts, or a purchase request's attachments (quote, invoice, photo). */
  kind?: "receipts" | "attachments";
}) {
  const words = kind === "attachments" ? { ...r, ...expensesCopy.attachments } : r;
  const ids = useId();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function upload(files: FileList | File[]) {
    setBusy(true);
    try {
      for (const original of [...files]) {
        let file = original;
        try {
          if (isHeic(file)) {
            setStatus({ kind: "busy", text: r.converting(file.name) });
            file = await toUploadable(file).catch(() => {
              throw new Error(e.receiptConvertFailed);
            });
          }
          if (!ALLOWED.includes(file.type)) throw new Error(e.receiptType);
          if (file.size > MAX_BYTES) throw new Error(e.receiptTooLarge);
          if (file.size === 0) throw new Error(e.receiptEmpty);
          setStatus({ kind: "busy", text: r.uploading(file.name) });
          setProgress(0);
          const prepared = await postJson(`/api/expenses/${expenseId}/receipts`, {
            fileName: file.name,
            size: file.size,
            contentType: file.type,
          });
          await put(String(prepared.uploadUrl), file, setProgress).catch(() => {
            throw new Error(e.receiptUploadFailed);
          });
          await postJson(`/api/expenses/${expenseId}/receipts/confirm`, {
            key: prepared.key,
            token: prepared.token,
            fileName: file.name,
          });
          setStatus({ kind: "done", text: r.added(file.name) });
        } catch (problem) {
          setStatus({
            kind: "error",
            text: problem instanceof Error ? problem.message : e.receiptUploadFailed,
          });
          break;
        } finally {
          setProgress(null);
        }
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function onFiles(list: FileList | null) {
    if (list && list.length > 0) void upload(list);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }

  function remove(item: ReceiptItem) {
    startTransition(async () => {
      const result = await removeReceiptAction({
        expenseId,
        fileId: item.id,
        fileName: item.fileName,
      });
      setStatus({ kind: result.status === "error" ? "error" : "done", text: result.message ?? "" });
      router.refresh();
    });
  }

  const full = receipts.length >= 5;
  const accept = "image/jpeg,image/png,image/heic,image/heif,application/pdf,.heic,.heif";

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">{words.intro}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {receipts.length === 0 ? (
        <p className="text-sm text-fg-muted">{words.none}</p>
      ) : (
        <ul className="divide-y divide-border rounded-control border border-border">
          {receipts.map((item) => {
            const Icon = item.contentType === "application/pdf" ? FileText : ImageIcon;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <Icon className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/expenses/${expenseId}/receipts/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(linkClass, "break-all")}
                    aria-label={r.view(item.fileName)}
                  >
                    {item.fileName}
                  </a>
                  <p className="text-xs text-fg-muted">
                    {r.size(Math.ceil(item.sizeBytes / 1024))}
                  </p>
                  {item.duplicate && (
                    <p className="flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {r.duplicate}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  className={buttonClass("ghost", "px-2 text-danger")}
                  aria-label={r.remove(item.fileName)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!full && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-control border border-dashed border-border-strong p-4",
            dragging && "border-accent bg-surface-hover",
          )}
        >
          {/* Phones only: the camera opens straight away. */}
          <div className="sm:hidden">
            <input
              ref={cameraInput}
              id={`${ids}-camera`}
              type="file"
              accept="image/*"
              capture="environment"
              className="peer sr-only"
              onChange={(event) => onFiles(event.target.files)}
              disabled={busy}
            />
            <label
              htmlFor={`${ids}-camera`}
              className={cn(
                buttonClass("secondary"),
                "cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                busy && "opacity-60",
              )}
            >
              <Camera className="size-4" aria-hidden="true" />
              {r.takePhoto}
            </label>
          </div>
          <input
            ref={fileInput}
            id={`${ids}-file`}
            type="file"
            accept={accept}
            multiple
            className="peer sr-only"
            onChange={(event) => onFiles(event.target.files)}
            disabled={busy}
          />
          <label
            htmlFor={`${ids}-file`}
            className={cn(
              buttonClass("secondary"),
              "cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
              busy && "opacity-60",
            )}
          >
            <Upload className="size-4" aria-hidden="true" />
            {r.chooseFile}
          </label>
          <span className="hidden text-sm text-fg-muted sm:inline">{r.dropHere}</span>
        </div>
      )}

      <div aria-live="polite" className="text-sm">
        {status && (
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={cn(
              "flex items-center gap-2",
              status.kind === "error" ? "text-danger" : "text-fg-muted",
            )}
          >
            {status.kind === "busy" && (
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {status.text}
            {progress !== null && <span className="tabular">{progress}%</span>}
          </p>
        )}
        {progress !== null && (
          <progress
            value={progress}
            max={100}
            className="mt-1 h-1.5 w-full"
            aria-label={words.heading}
          />
        )}
      </div>
    </div>
  );
}
