import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getOffers } from "@/app/api/v1/offers/route";
import { POST as postShareRoute } from "@/app/api/v1/share/route";
import { POST as postEventsRoute } from "@/app/api/v1/events/route";
import {
  wallClaim,
  wallImpressions,
  wallOpen,
  wallShare,
} from "@/app/wall/actions";
import { COPY } from "@/lib/copy";
import { hashKey } from "@/lib/channels";
import { db } from "@/lib/db";
import {
  fetchOffers,
  loadWallOffers,
  postEvents,
  postShare,
} from "@/lib/wall-api";

const KEY = "phx_wall_key";
const DAY = 86_400_000;
const seen: Request[] = [];

// Routes the helpers' fetches to the real v1 handlers, remembering each request.
const fetchImpl = (async (input: string, init?: RequestInit) => {
  const req = new Request(input, init);
  seen.push(req.clone());
  const { pathname } = new URL(req.url);
  if (pathname.endsWith("/offers")) return getOffers(req);
  return pathname.endsWith("/share")
    ? postShareRoute(req)
    : postEventsRoute(req);
}) as typeof fetch;

async function seedLive() {
  await db.channel.create({
    data: {
      key: "phoenix",
      name: "Phoenix",
      apiKeyHash: hashKey(KEY),
      isLive: true,
    },
  });
  const workspace = await db.workspace.create({
    data: {
      name: "Kola Bright",
      type: "Brand",
      country: "NG",
      status: "approved",
    },
  });
  return db.campaign.create({
    data: {
      workspaceId: workspace.id,
      name: "Buy 2 get 1",
      brand: "Kola Bright",
      country: "NG",
      category: "Food & drink",
      headline: "Buy 2 Kola Bright, get 1 free",
      description: "At any stockist.",
      placement: "card",
      redeemMethod: "code",
      claimCode: "KOLA2X1",
      budgetUsd: 100,
      status: "live",
      shareRewardLabel: "₦50 airtime",
      startsAt: new Date(Date.now() - DAY),
      endsAt: new Date(Date.now() + 7 * DAY),
    },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  seen.length = 0;
});

describe("wall-api", () => {
  it("pulls offers with the bearer key and country", async () => {
    vi.stubEnv("DEMO_CHANNEL_KEY", KEY);
    vi.stubEnv("APP_URL", "http://localhost:3100");
    await seedLive();
    const res = await fetchOffers("NG", fetchImpl);
    expect(res.offers.map((o) => o.headline)).toEqual([
      "Buy 2 Kola Bright, get 1 free",
    ]);
    expect(seen[0].headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(seen[0].url).toBe("http://localhost:3100/api/v1/offers?country=NG");
  });

  it("posts events as phoenix with an idempotency key, and mints a share link", async () => {
    vi.stubEnv("DEMO_CHANNEL_KEY", KEY);
    vi.stubEnv("APP_URL", "http://localhost:3100");
    const campaign = await seedLive();
    const ev = {
      type: "impression" as const,
      offer_id: campaign.id,
      session_id: "s1",
      ts: new Date().toISOString(),
    };
    const out = await postEvents([ev], fetchImpl);
    expect(out).toEqual({ accepted: 1, deduped: 0, ignored: 0 });
    expect(seen[0].headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
    expect((await seen[0].json()).channel).toBe("phoenix");

    const link = await postShare(campaign.id, "s1", "whatsapp", fetchImpl);
    expect(link.url).toContain(link.code);
  });
});

describe("loadWallOffers", () => {
  const down = (async () =>
    new Response("boom", { status: 500 })) as unknown as typeof fetch;

  it("fetchOffers rejects with a clear error on a non-OK answer", async () => {
    await expect(fetchOffers("NG", down)).rejects.toThrow(
      "channel API answered 500",
    );
  });

  it("returns no offers and the error note instead of throwing", async () => {
    expect(await loadWallOffers("NG", down)).toEqual({
      offers: [],
      error: COPY.wall.error,
    });
    const refused = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect((await loadWallOffers("NG", refused)).offers).toEqual([]);
  });
});

describe("wall actions gate", () => {
  it.each([
    ["wallImpressions", () => wallImpressions(["a"])],
    ["wallOpen", () => wallOpen("a")],
    ["wallShare", () => wallShare("a", "whatsapp")],
    ["wallClaim", () => wallClaim("a")],
  ])("%s refuses unless DEMO_WALL is 1", async (_name, call) => {
    vi.stubEnv("DEMO_WALL", "");
    await expect(call()).rejects.toThrow("The demo wall is off");
  });
});
