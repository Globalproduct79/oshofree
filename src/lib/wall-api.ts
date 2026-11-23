import "server-only";
import { randomUUID } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { COPY } from "@/lib/copy";
import type { OfferDto } from "@/lib/offers";

// The demo wall's four calls to the channel API, made as Phoenix will: bearer key, JSON, v1 paths.
// The key and base URL are read per call so the page and the server actions never cache them.
export const WALL_COUNTRIES = ["NG", "KE", "GH", "TZ", "SN"] as const;

export type WallEvent = {
  type: "impression" | "open" | "claim" | "share";
  offer_id: string;
  placement?: string;
  country?: string;
  session_id: string;
  token?: string;
  claim_code?: string;
  ts: string;
};

// What the wall knows of an offer when it reports on it: the id, and the slot it was shown in.
export type WallOffer = { id: string; placement: string };

// One event per offer, as Phoenix's SDK reports it: the offer's own placement, the market, the session, one moment.
export function wallEvents(
  type: WallEvent["type"],
  offers: WallOffer[],
  country: string,
  session_id: string,
  ts: string,
  extra: Partial<WallEvent> = {},
): WallEvent[] {
  return offers.map((o) => ({
    type,
    offer_id: o.id,
    placement: o.placement,
    country,
    session_id,
    ts,
    ...extra,
  }));
}

const call = (path: string, init: RequestInit, fetchImpl: typeof fetch) =>
  fetchImpl(appUrl(`/api/v1${path}`), {
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

// A code offer's code is the session's own, asked for at claim time.
export async function postClaim(
  offerId: string,
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const res = await call(
    "/claims",
    {
      method: "POST",
      body: JSON.stringify({ offer_id: offerId, session_id: sessionId }),
    },
    fetchImpl,
  );
  return json<{ code: string; valid_until: string }>(res);
}

// The page's read: an unreachable API leaves the wall up with no offers and a note, not an error page.
export async function loadWallOffers(
  country: string,
  fetchImpl: typeof fetch = fetch,
) {
  try {
    return {
      offers: (await fetchOffers(country, fetchImpl)).offers,
      error: null as string | null,
    };
  } catch {
    return {
      offers: [] as OfferDto[],
      error: COPY.wall.error as string | null,
    };
  }
}
