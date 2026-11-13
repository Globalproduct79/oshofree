import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { loadWallOffers, WALL_COUNTRIES } from "@/lib/wall-api";
import { WallClient } from "./WallClient";

export const dynamic = "force-dynamic";

export default async function WallPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  if (process.env.DEMO_WALL !== "1") notFound();
  const { country: asked } = await searchParams;
  const country = WALL_COUNTRIES.find((c) => c === asked) ?? "NG";
  const { offers, error } = await loadWallOffers(country);
  const jar = await cookies();
  // A page render cannot set cookies; the client sets it on mount when missing, so reuse or mint one here.
  const sessionId = jar.get("wall_session")?.value ?? randomUUID();
  return (
    <WallClient
      error={error}
      offers={offers}
      country={country}
      sessionId={sessionId}
    />
  );
}
