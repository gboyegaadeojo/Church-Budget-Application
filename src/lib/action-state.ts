/** What a server action tells its form: nothing yet, done, or why not. */
export type ActionState =
  | { status: "idle"; message?: undefined; fieldErrors?: undefined; latestHref?: undefined }
  | { status: "success"; message: string; fieldErrors?: undefined; latestHref?: undefined }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string>;
      /** For a conflict: where to see the latest version (DRD 11.2). */
      latestHref?: string;
    };
