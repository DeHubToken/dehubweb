import { useTranslation as _useCopy } from 'react-i18next';
import { translateCopy as _translateCopy } from '@/i18n/copy';
/**
 * Community Invite Embed
 * ======================
 * An invite link (`/app/communities/join/<code>`) rendered as a card.
 *
 * Distinct from CommunityLinkEmbed on purpose: an invite is an offer, not a
 * destination, and the card says which community, whether joining needs
 * approval, and — when the code is dead — why it will not work. That last part
 * is the reason this exists. An invite that has been revoked, has expired or
 * has hit its member cap used to look identical to a live one until the
 * recipient tapped it and landed on an error page.
 *
 * The preview RPC is public, so the card fills in for signed-out readers too.
 */

import { useNavigate } from 'react-router-dom';
import { Ticket } from "lucide-react";
import Users from "@/components/ui/cut-icons/communities";
import ShieldCheck from "@/components/ui/cut-icons/security";

import type { ReactNode } from 'react';
import { useInvitePreview } from '@/hooks/use-community-admin';
import { storageImage, deviceWidth } from '@/lib/media-url';
import { DescriptionWithLinks } from '@/components/app/communities/DescriptionWithLinks';

interface CommunityInviteEmbedProps {
  code: string;
  fallback?: ReactNode;
}

const INVALID_REASON_COPY: Record<string, string> = {
  get revoked() { return _translateCopy("copy.d8fb3309e7d7", { defaultValue: "Invite revoked" }); },
  get expired() { return _translateCopy("copy.1c289b31ef0f", { defaultValue: "Invite expired" }); },
  get exhausted() { return _translateCopy("copy.952133b2dee2", { defaultValue: "Invite fully used" }); },
  get not_found() { return _translateCopy("copy.a2492a22aba2", { defaultValue: "Invite not found" }); },
};

export function CommunityInviteEmbed({ code, fallback = null }: CommunityInviteEmbedProps) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const { data: preview, isLoading, isError } = useInvitePreview(code);

  if (isLoading) {
    return <div className="mt-2 h-16 rounded-xl theme-skeleton animate-pulse" />;
  }

  // The RPC is set to retry: false, so a transient failure lands here rather
  // than looping. Showing the link beats inventing a reason it is broken.
  if (isError || !preview) return <>{fallback}</>;

  const isValid = !!preview.is_valid;
  const name = preview.name || _copy("copy.d87ca853de3c", { defaultValue: "a community" });
  const invalidCopy = INVALID_REASON_COPY[preview.reason ?? 'not_found'] ?? _copy("copy.cf9f7729c86c", { defaultValue: "Invite unavailable" });

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/app/communities/join/${code}`);
      }}
      data-no-navigate
      className={`w-full flex items-center gap-3 p-3 mt-2 rounded-xl border transition-colors text-left relative overflow-hidden ${
        isValid
          ? 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07]'
          : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
      }`}
    >
      {isValid && preview.banner_url && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${storageImage(preview.banner_url, deviceWidth(360))})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.42,
            maskImage: 'linear-gradient(to right, transparent 30%, black 70%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 30%, black 70%)',
          }}
        />
      )}

      <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0">
        {isValid && preview.avatar_url ? (
          <img src={storageImage(preview.avatar_url, deviceWidth(48))} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <Ticket className={`w-5 h-5 ${isValid ? 'text-zinc-400' : 'text-zinc-600'}`} />
        )}
      </div>

      <div className="flex-1 min-w-0 relative">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">
          {isValid ? _copy("copy.587a94f0de38", { defaultValue: "Community invite" }) : invalidCopy}
        </p>
        <p className={`text-sm font-semibold truncate ${isValid ? 'text-white' : 'text-zinc-400'}`}>
          {isValid ? name : _copy("copy.47e4ea17be3b", { defaultValue: "This invite cannot be used" })}
        </p>
        {isValid && preview.description && (
          <DescriptionWithLinks text={preview.description} singleLine className="text-xs mt-0.5 text-slate-50" />
        )}
        {isValid && (
          <div className="flex items-center gap-3 mt-1">
            {typeof preview.member_count === 'number' && (
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Users className="w-3 h-3" />
                <span className="font-semibold text-zinc-300">
                  {preview.member_count.toLocaleString()}
                </span>{' '}{_copy("copy.1044a4c056d0", { defaultValue: "Members" })}</span>
            )}
            {preview.requires_approval && (
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <ShieldCheck className="w-3 h-3" />{_copy("copy.9928dd82f38f", { defaultValue: "Approval needed" })}</span>
            )}
          </div>
        )}
      </div>
      {isValid && (
        <span className="relative flex-shrink-0 rounded-full bg-white/[0.12] px-3 py-1.5 text-xs font-semibold text-white">
          {_copy("communities.join")}
        </span>
      )}
    </button>
  );
}
