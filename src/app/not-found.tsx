import Link from "next/link";
import { copy } from "@/copy/en-CA";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{copy.notFound.title}</h1>
        <p className="text-fg-muted">{copy.notFound.body}</p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover"
        >
          {copy.comingSoon.backHome}
        </Link>
      </div>
    </main>
  );
}
