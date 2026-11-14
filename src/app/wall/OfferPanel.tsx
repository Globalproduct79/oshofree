import { Gift } from "lucide-react";
import { COPY } from "@/lib/copy";
import type { OfferDto } from "@/lib/offers";
import { tokens } from "@/lib/tokens";

const W = COPY.wall;
const btn = "rounded-md px-3 py-1.5 text-xs font-medium";

type Props = {
  offer: OfferDto;
  code: string | undefined;
  link: string | undefined;
  shareFailed: boolean;
  onClaim: () => void;
  onShare: () => void;
};

// The expanded card: description, reward, Claim and Share, then the session's claim code or the minted link.
export function OfferPanel({
  offer: o,
  code,
  link,
  shareFailed,
  onClaim,
  onShare,
}: Props) {
  return (
    <div
      className="mt-1 flex flex-col gap-2 rounded-lg border p-3 text-xs"
      style={{ borderColor: tokens.line, backgroundColor: tokens.card }}
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
          onClick={onClaim}
        >
          {o.cta.type === "code" ? W.claim : o.cta.label}
        </button>
        {o.share.enabled && (
          <button
            type="button"
            className={btn}
            style={{ border: `1px solid ${tokens.line}`, color: tokens.ink }}
            onClick={onShare}
          >
            {W.share}
          </button>
        )}
      </div>
      {code && o.cta.type === "code" && (
        <p
          className="rounded-md px-3 py-2 text-center text-base font-bold tracking-widest"
          style={{ backgroundColor: tokens.bg, color: tokens.ink }}
          aria-label={W.code}
        >
          {code}
        </p>
      )}
      {shareFailed ? (
        <p role="alert" style={{ color: tokens.ink3 }}>
          {W.actionFailed}
        </p>
      ) : (
        link && (
          <label className="flex flex-col gap-1" style={{ color: tokens.ink3 }}>
            {W.shareLead}
            <input
              readOnly
              value={link}
              className="rounded-md border px-2 py-1"
              style={{ borderColor: tokens.line, color: tokens.ink }}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
        )
      )}
    </div>
  );
}
