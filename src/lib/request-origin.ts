import { deviceLabel } from "@/domain/notifications/push";

/**
 * Where a sign-in request came from, in words, for the sign-in code email only
 * ("Chrome on a Windows computer, near Winnipeg, MB"). The place comes from the host's own
 * location headers (Vercel's x-vercel-ip-*, Netlify's x-nf-geo), so no outside lookup and
 * no stored address: it lives only in the email's body, which is cleared once sent.
 */

export type RequestOrigin = { userAgent: string; place: string | null };

/** The browser's everyday name, from its user agent. */
export function browserLabel(userAgent: string): string | null {
  if (/Edg(e|A|iOS)?\//.test(userAgent)) return "Edge";
  if (/OPR\/|Opera/.test(userAgent)) return "Opera";
  if (/SamsungBrowser\//.test(userAgent)) return "Samsung Internet";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return null;
}

/** "Chrome on a Windows computer", "Safari on an iPhone", or null when it can't tell. */
export function deviceDescription(userAgent: string): string | null {
  const browser = browserLabel(userAgent);
  const device = deviceLabel(userAgent);
  if (device === "Device") return browser;
  const article = /^[AEIOU]/.test(device) || device.startsWith("iP") ? "an" : "a";
  return browser
    ? `${browser} on ${article} ${device}`
    : `${article === "an" ? "An" : "A"} ${device}`;
}

type HeaderGetter = (name: string) => string | null;

function decode(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/** "Winnipeg, MB", "Seattle, WA, US", or null when the host doesn't say. */
export function placeFromHeaders(get: HeaderGetter): string | null {
  let city = decode(get("x-vercel-ip-city"));
  let region = decode(get("x-vercel-ip-country-region"));
  let country = decode(get("x-vercel-ip-country"));
  const netlify = get("x-nf-geo");
  if (!city && netlify) {
    try {
      const geo = JSON.parse(Buffer.from(netlify, "base64").toString("utf8")) as {
        city?: string;
        subdivision?: { code?: string };
        country?: { code?: string };
      };
      city = geo.city?.trim() ?? "";
      region = geo.subdivision?.code?.trim() ?? "";
      country = geo.country?.code?.trim() ?? "";
    } catch {
      return null;
    }
  }
  // Only plain place names: these end up in an email.
  const clean = (s: string) => (/^[\p{L}\p{M} .'-]{1,60}$/u.test(s) ? s : "");
  const parts = [clean(city), clean(region), country && country !== "CA" ? clean(country) : ""];
  return clean(city) ? parts.filter(Boolean).join(", ") : null;
}

/** The whole line, e.g. "Chrome on a Windows computer, near Winnipeg, MB". */
export function originText(origin: RequestOrigin): string | null {
  const device = deviceDescription(origin.userAgent);
  if (!device && !origin.place) return null;
  if (!origin.place) return device;
  return device ? `${device}, near ${origin.place}` : `Near ${origin.place}`;
}
