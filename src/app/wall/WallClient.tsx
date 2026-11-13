"use client";

import { Gift } from "lucide-react";
import { useEffect, useState } from "react";
import { PhoneFrame } from "@/components/campaign/PhoneFrame";
import { OfferCard } from "@/components/campaign/OfferCard";
import { COPY } from "@/lib/copy";
import type { OfferDto } from "@/lib/offers";
import { tokens } from "@/lib/tokens";
import { wallClaim, wallImpressions, wallOpen, wallShare } from "./actions";

const W = COPY.wall;

// Stands in for Phoenix's Offers screen: every tap goes through the same server actions, which call the v1 API.
export function WallClient({
  offers,
  country,
  sessionId,
}: {
  offers: OfferDto[];
  country: string;
  sessionId: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [claimed, setClaimed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Session-scoped cookie (no expiry), set before the first action so every call carries it.
    document.cookie = `wall_session=${sessionId}; path=/; SameSite=Lax`;
    if (offers.length)
      void wallImpressions(
        offers.map((o) => o.id),
        country,
      );
  }, [offers, country, sessionId]);

  const open = (id: string) => {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    void wallOpen(id, country);
  };
  const share = async (id: string) => {
    const { url } = await wallShare(id, "whatsapp");
    setLinks((l) => ({ ...l, [id]: url }));
  };
  const claim = (o: OfferDto) => {
    if (o.cta.type === "link" && o.cta.url)
      return void window.open(o.cta.url, "_blank", "noopener");
    setClaimed((c) => new Set(c).add(o.id));
    void wallClaim(o.id, country);
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
  const btn = "rounded-md px-3 py-1.5 text-xs font-medium";
  return (
    <main className="flex flex-col items-center gap-4 p-6">
      <PhoneFrame cards={chips} note={offers.length ? null : W.empty}>
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
              <div
                className="mt-1 flex flex-col gap-2 rounded-lg border p-3 text-xs"
                style={{
                  borderColor: tokens.line,
                  backgroundColor: tokens.card,
                }}
              >
                <p style={{ color: tokens.ink2 }}>{o.description}</p>
                <p
                  className="flex items-center gap-1.5 font-medium"
                  style={{ color: tokens.ink }}
                >
                  <Gift
                    className="size-3.5"
                    style={{ color: tokens.accent }}
                    aria-hidden
                  />
                  {o.share.reward_label}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={btn}
                    style={{ backgroundColor: tokens.ink, color: tokens.card }}
                    onClick={() => claim(o)}
                  >
                    {o.cta.type === "code" ? W.claim : o.cta.label}
                  </button>
                  {o.share.enabled && (
                    <button
                      type="button"
                      className={btn}
                      style={{
                        border: `1px solid ${tokens.line}`,
                        color: tokens.ink,
                      }}
                      onClick={() => share(o.id)}
                    >
                      {W.share}
                    </button>
                  )}
                </div>
                {claimed.has(o.id) && o.cta.type === "code" && (
                  <p
                    className="rounded-md px-3 py-2 text-center text-base font-bold tracking-widest"
                    style={{ backgroundColor: tokens.bg, color: tokens.ink }}
                    aria-label={W.code}
                  >
                    {o.cta.label}
                  </p>
                )}
                {links[o.id] && (
                  <label
                    className="flex flex-col gap-1"
                    style={{ color: tokens.ink3 }}
                  >
                    {W.shareLead}
                    <input
                      readOnly
                      value={links[o.id]}
                      className="rounded-md border px-2 py-1"
                      style={{ borderColor: tokens.line, color: tokens.ink }}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        ))}
      </PhoneFrame>
      <p
        className="max-w-xs text-center text-xs"
        style={{ color: tokens.ink3 }}
      >
        {W.note}
      </p>
    </main>
  );
}
