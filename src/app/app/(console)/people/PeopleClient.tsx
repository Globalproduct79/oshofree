"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Box, Button } from "@/components/og";
import { toast } from "@/components/shell/toast-store";
import { PEOPLE } from "@/lib/copy-people";
import { initials } from "@/lib/format";
import { tokens } from "@/lib/tokens";
import {
  changeRoleAction,
  removeMemberAction,
  revokeInviteAction,
} from "./actions";
import { copyInviteLink, InviteLinkModal } from "./InviteLink";

type Role = "Owner" | "Manager" | "Viewer";
type Member = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  isLastOwner: boolean;
};
type Pending = { id: string; email: string; role: Role; url: string | null };

const avatar: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: tokens.blueSoft,
  color: tokens.blue,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 12,
  flex: "none",
};
const grey: React.CSSProperties = { color: tokens.ink3, fontSize: 12 };

export function PeopleClient({
  canManage,
  members,
  pending,
  children,
}: {
  canManage: boolean;
  members: Member[];
  pending: Pending[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  // The invite link the clipboard refused, shown in a modal (never a toast: the link is a credential).
  const [shownUrl, setShownUrl] = useState<string | null>(null);

  const change = (userId: string, next: string) =>
    start(async () => {
      const r = await changeRoleAction(userId, next);
      if (r.error) toast(PEOPLE.lastOwner);
      router.refresh();
    });
  const remove = (userId: string) =>
    start(async () => {
      const r = await removeMemberAction(userId);
      if (r.error) toast(PEOPLE.lastOwnerRemove);
      router.refresh();
    });
  const revoke = (id: string) =>
    start(async () => {
      await revokeInviteAction(id);
      router.refresh();
    });
  const copy = (url: string) => copyInviteLink(url, setShownUrl);

  return (
    <div className="two">
      <div>
        <Box title={PEOPLE.members}>
          <ul className="roles">
            {members.map((m) => (
              <li key={m.userId}>
                <span style={avatar}>{initials(m.name)}</span>
                <div style={{ flex: 1 }}>
                  <b>{m.name}</b>
                  <div style={grey}>{m.email}</div>
                </div>
                {canManage ? (
                  <select
                    aria-label={`Role for ${m.name}`}
                    value={m.role}
                    disabled={busy || m.isLastOwner}
                    title={m.isLastOwner ? PEOPLE.lastOwner : undefined}
                    onChange={(e) => change(m.userId, e.target.value)}
                  >
                    <option>Owner</option>
                    <option>Manager</option>
                    <option>Viewer</option>
                  </select>
                ) : (
                  <span style={{ fontSize: 13 }}>{m.role}</span>
                )}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="s"
                    disabled={busy || m.isLastOwner}
                    onClick={() => remove(m.userId)}
                  >
                    {PEOPLE.remove}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Box>
        <Box title={PEOPLE.openInvites}>
          {pending.length === 0 ? (
            <p className="sub">{PEOPLE.noOpenInvites}</p>
          ) : (
            <ul className="roles">
              {pending.map((p) => (
                <li key={p.id}>
                  <span style={avatar}>{p.email[0].toUpperCase()}</span>
                  <div style={{ flex: 1 }}>
                    <b>{p.email}</b>
                    <div style={grey}>{PEOPLE.invited(p.role)}</div>
                  </div>
                  {canManage && p.url && (
                    <>
                      <Button
                        variant="ghost"
                        size="s"
                        onClick={() => copy(p.url!)}
                      >
                        {PEOPLE.copyLink}
                      </Button>
                      <Button
                        variant="ghost"
                        size="s"
                        disabled={busy}
                        onClick={() => revoke(p.id)}
                      >
                        {PEOPLE.revoke}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>
      <div>{children}</div>
      <InviteLinkModal url={shownUrl} onClose={() => setShownUrl(null)} />
    </div>
  );
}
