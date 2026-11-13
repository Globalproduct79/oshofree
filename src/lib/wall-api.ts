import { randomUUID } from "node:crypto";
import type { OfferDto } from "@/lib/offers";

// The demo wall's three calls to the channel API, made as Phoenix will: bearer key, JSON, v1 paths.
// The key and base URL are read per call so the page and the server actions never cache them.
export const WALL_COUNTRIES = ["NG", "KE", "GH", "TZ", "SN"] as const;

export type WallEvent = {
  type: "impression" | "open" | "claim" | "share";
  offer_id: string;
  placement?: string;
  country?: string;
  session_id: string;
  link_code?: string;
  ts: string;
};

const call = (path: string, init: RequestInit, fetchImpl: typeof fetch) =>
  fetchImpl(`${process.env.APP_URL}/api/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${process.env.DEMO_CHANNEL_KEY}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`channel API answered ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchOffers(
  country: string,
  fetchImpl: typeof fetch = fetch,
) {
  const res = await call(
    `/offers?country=${encodeURIComponent(country)}`,
    {},
    fetchImpl,
  );
  return json<{
    country: string;
    generated_at: string;
    ttl_seconds: number;
    offers: OfferDto[];
  }>(res);
}

export async function postEvents(
  events: WallEvent[],
  fetchImpl: typeof fetch = fetch,
) {
  const res = await call(
    "/events",
    {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ channel: "phoenix", events }),
    },
    fetchImpl,
  );
  return json<{ accepted: number; deduped: number; ignored: number }>(res);
}

export async function postShare(
  offerId: string,
  sessionId: string,
  via: string,
  fetchImpl: typeof fetch = fetch,
) {
  const res = await call(
    "/share",
    {
      method: "POST",
      body: JSON.stringify({ offer_id: offerId, session_id: sessionId, via }),
    },
    fetchImpl,
  );
  return json<{ code: string; url: string }>(res);
}
