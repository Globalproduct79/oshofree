"use server";

import { cookies } from "next/headers";
import {
  postClaim,
  postEvents,
  postShare,
  wallEvents,
  type WallEvent,
  type WallOffer,
} from "@/lib/wall-api";

// Server-side only: the channel key stays here. Every action refuses unless the wall is switched on.
async function session() {
  if (process.env.DEMO_WALL !== "1") throw new Error("The demo wall is off");
  const id = (await cookies()).get("wall_session")?.value;
  if (!id) throw new Error("No wall session");
  return id;
}

const send = async (
  type: WallEvent["type"],
  offers: WallOffer[],
  country: string,
  extra: Partial<WallEvent> = {},
) => {
  const session_id = await session();
  const ts = new Date().toISOString();
  await postEvents(wallEvents(type, offers, country, session_id, ts, extra));
};

export async function wallImpressions(offers: WallOffer[], country = "NG") {
  await send("impression", offers, country);
}

export async function wallOpen(offer: WallOffer, country = "NG") {
  await send("open", [offer], country);
}

// A code offer: ask POST /claims for this session's code, then post the claim with it. A link offer: the tap on its
// button is the claim (the browser follows cta.url to the brand), so only the claim is posted and there is no code.
export async function wallClaim(
  offer: WallOffer & { redeem: "code" | "link" },
  country = "NG",
): Promise<{ code: string | null }> {
  if (offer.redeem === "link") {
    await send("claim", [offer], country);
    return { code: null };
  }
  const { code } = await postClaim(offer.id, await session());
  await send("claim", [offer], country, { claim_code: code });
  return { code };
}

export async function wallShare(
  id: string,
  via: string,
): Promise<{ url: string }> {
  const { url } = await postShare(id, await session(), via);
  return { url };
}
