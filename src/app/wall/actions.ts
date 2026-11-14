"use server";

import { cookies } from "next/headers";
import {
  postClaim,
  postEvents,
  postShare,
  type WallEvent,
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
  ids: string[],
  country: string,
  extra: Partial<WallEvent> = {},
) => {
  const session_id = await session();
  const ts = new Date().toISOString();
  await postEvents(
    ids.map((offer_id) => ({
      type,
      offer_id,
      placement: "card",
      country,
      session_id,
      ts,
      ...extra,
    })),
  );
};

export async function wallImpressions(ids: string[], country = "NG") {
  await send("impression", ids, country);
}

export async function wallOpen(id: string, country = "NG") {
  await send("open", [id], country);
}

// A code offer: ask POST /claims for this session's code, then post the claim with it.
export async function wallClaim(
  id: string,
  country = "NG",
): Promise<{ code: string }> {
  const { code } = await postClaim(id, await session());
  await send("claim", [id], country, { claim_code: code });
  return { code };
}

export async function wallShare(
  id: string,
  via: string,
): Promise<{ url: string }> {
  const { url } = await postShare(id, await session(), via);
  return { url };
}
