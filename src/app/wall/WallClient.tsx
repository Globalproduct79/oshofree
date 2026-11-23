"use client";

import { useEffect, useRef, useState } from "react";
import { WallFrame } from "@/components/campaign/WallFrame";
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
  const [codes, setCodes] = useState<Record<string, string>>({});
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
        offers.map((o) => ({ id: o.id, placement: o.placement })),
        country,
      ),
    );
  }, [offers, country, sessionId]);

  const open = (o: OfferDto) => {
    if (openId === o.id) return setOpenId(null);
    setOpenId(o.id);
    fire(wallOpen({ id: o.id, placement: o.placement }, country));
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
  // A link offer opens its cta.url in the tap itself (a pop-up opened later is blocked), then reports the claim.
  const claim = (o: OfferDto) => {
    const offer = { id: o.id, placement: o.placement, redeem: o.cta.type };
    if (o.cta.type === "link" && o.cta.url) {
      window.open(o.cta.url, "_blank", "noopener");
      return void fire(wallClaim(offer, country));
    }
    fire(
      wallClaim(offer, country).then(({ code }) => {
        if (code) setCodes((c) => ({ ...c, [o.id]: code }));
      }),
    );
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
      <WallFrame cards={chips} note={note}>
        {offers.map((o) => (
          <div key={o.id} className="col-span-2">
            <button
              type="button"
              onClick={() => open(o)}
              className="block w-full text-left"
            >
              <OfferCard
                offer={{
                  brand: o.brand,
                  headline: o.headline,
                  description: openId === o.id ? "" : o.description,
                  imageUrl: o.creative.image,
                  // Opened, the panel plays the clip; the card shows it once, there.
                  videoUrl: openId === o.id ? null : o.creative.video,
                  color: o.creative.color,
                  rewardLabel: o.share.reward_label,
                  endsAt: new Date(o.ends_at),
                }}
              />
            </button>
            {openId === o.id && (
              <OfferPanel
                offer={o}
                code={codes[o.id]}
                link={links[o.id]}
                shareFailed={shareFailed === o.id}
                onClaim={() => claim(o)}
                onShare={() => share(o.id)}
              />
            )}
          </div>
        ))}
      </WallFrame>
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
