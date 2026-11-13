"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneFrame } from "@/components/campaign/PhoneFrame";
import { OfferCard } from "@/components/campaign/OfferCard";
import { COPY } from "@/lib/copy";
import type { OfferDto } from "@/lib/offers";
import { tokens } from "@/lib/tokens";
import { wallClaim, wallImpressions, wallOpen, wallShare } from "./actions";
import { OfferPanel } from "./OfferPanel";

const W = COPY.wall;

type Props = {
  offers: OfferDto[];
  country: string;
  sessionId: string;
  error?: string | null;
};

// Stands in for Phoenix's Offers screen: every tap goes through the same server actions, which call the v1 API.
export function WallClient({
  offers,
  country,
  sessionId,
  error = null,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [shareFailed, setShareFailed] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const posted = useRef<string | null>(null);

  // A fire-and-forget event: a failure shows one line instead of an unhandled rejection.
  const fire = (call: Promise<unknown>) =>
    call.then(
      () => setFailed(false),
      () => setFailed(true),
    );

  useEffect(() => {
    // Session-scoped cookie (no expiry), set before the first action so every call carries it.
    document.cookie = `wall_session=${sessionId}; path=/; SameSite=Lax`;
    const key = `${country}:${sessionId}`;
    // Strict Mode runs effects twice in development; post this wall's impressions once.
    if (!offers.length || posted.current === key) return;
    posted.current = key;
    fire(
      wallImpressions(
        offers.map((o) => o.id),
        country,
      ),
    );
  }, [offers, country, sessionId]);

  const open = (id: string) => {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    fire(wallOpen(id, country));
  };
  const share = async (id: string) => {
    setShareFailed(null);
    try {
      const { url } = await wallShare(id, "whatsapp");
      setLinks((l) => ({ ...l, [id]: url }));
    } catch {
      setShareFailed(id);
    }
  };
  const claim = (o: OfferDto) => {
    if (o.cta.type === "link" && o.cta.url)
      return void window.open(o.cta.url, "_blank", "noopener");
    setClaimed((c) => new Set(c).add(o.id));
    fire(wallClaim(o.id, country));
  };

  const chips = offers.map((o) => ({
    key: o.id,
    brand: o.brand,
    headline: o.headline,
    description: o.description,
    category: o.category,
    rewardLabel: o.share.reward_label,
    endsAt: new Date(o.ends_at),
  }));
  const note = error ?? (offers.length ? null : W.empty);
  return (
    <main className="flex flex-col items-center gap-4 p-6">
      <PhoneFrame cards={chips} note={note}>
        {offers.map((o) => (
          <div key={o.id} className="col-span-2">
            <button
              type="button"
              onClick={() => open(o.id)}
              className="block w-full text-left"
            >
              <OfferCard
                offer={{
                  brand: o.brand,
                  headline: o.headline,
                  description: openId === o.id ? "" : o.description,
                  imageUrl: o.creative.image,
                  color: o.creative.color,
                  rewardLabel: o.share.reward_label,
                  endsAt: new Date(o.ends_at),
                }}
              />
            </button>
            {openId === o.id && (
              <OfferPanel
                offer={o}
                claimed={claimed.has(o.id)}
                link={links[o.id]}
                shareFailed={shareFailed === o.id}
                onClaim={() => claim(o)}
                onShare={() => share(o.id)}
              />
            )}
          </div>
        ))}
      </PhoneFrame>
      {failed && (
        <p role="alert" className="text-xs" style={{ color: tokens.ink3 }}>
          {W.actionFailed}
        </p>
      )}
      <p
        className="max-w-xs text-center text-xs"
        style={{ color: tokens.ink3 }}
      >
        {W.note}
      </p>
    </main>
  );
}
