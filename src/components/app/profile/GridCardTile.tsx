/**
 * Grid card tiles
 * ===============
 * A profile grid post that carries a card in the feed (a stage, an event, a
 * poll, a quoted or shared post, a link preview, a community, a shop item, a
 * profile) becomes a small copy of that card: the card's picture on top, its
 * name underneath, and a pill top-left saying what it is. A stage that is on
 * right now gets a red "Live stage" pill.
 *
 * Every face reads the same query the feed card reads (same cache key), so a
 * card seen in the feed is instant here and the other way round. While a card
 * loads, or if it can't be read (deleted, private), the tile stays the text
 * poster it always was, with the pill added — never an empty box.
 *
 * Pictures and videos that are more than a plain picture or video (a Short, a
 * Comic, a watch-to-earn post) get the same pill: GridKindPill.
 */

import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNowStrict, format, isPast } from 'date-fns';
import Mic from '@/components/ui/cut-icons/mic';
import Calendar from '@/components/ui/cut-icons/events';
import Stats from '@/components/ui/cut-icons/stats';
import Quote from '@/components/ui/cut-icons/quote';
import Link2 from '@/components/ui/cut-icons/link';
import Users from '@/components/ui/cut-icons/communities';
import Store from '@/components/ui/cut-icons/store';
import Shorts from '@/components/ui/cut-icons/shorts';
import Packs from '@/components/ui/cut-icons/packs';
import Coins from '@/components/ui/cut-icons/coins';
import Bounties from '@/components/ui/cut-icons/bounties';
import Feedshare from '@/components/ui/cut-icons/feedshare';
import Profile from '@/components/ui/cut-icons/profile';
import LiveTv from '@/components/ui/cut-icons/live-tv';
import Apps from '@/components/ui/cut-icons/apps';
import Governance from '@/components/ui/cut-icons/governance';
import { supabase } from '@/integrations/supabase/client';
import { StageCoverArt } from '@/components/app/stages/StageCoverArt';
import { usePoll } from '@/hooks/use-polls';
import { useCommunity } from '@/hooks/use-communities';
import { useInvitePreview } from '@/hooks/use-community-admin';
import { getAccountByUsername } from '@/lib/api/dehub/users';
import { getNFTInfo } from '@/lib/api/dehub';
import type { DeHubNFT } from '@/lib/api/dehub/types';
import { fetchLinkPreview, peekLinkPreview, type LinkPreviewData } from '@/lib/api/link-preview';
import { outsideImage } from '@/lib/outside-image';
import { buildAvatarUrl, cdnImage, deviceWidth, storageImage } from '@/lib/media-url';
import { resolveQuotedPostMedia } from '@/components/app/cards/QuotedPostEmbed';
import { linkHost, type GridCardKind, type TextCard } from '@/lib/grid-card';
import { parseSpotifyLink, type SpotifyLink } from '@/lib/spotify';
import { spotifyPositionNow, useSpotifyOnScreen, useSpotifyProgress } from '@/lib/spotify-player';
import {
  PauseGlyph,
  PlayGlyph,
  SpotifyEq,
  SpotifyLogo,
  SpotifySpinner,
  useSpotifyControls,
  useSpotifyItem,
} from '@/components/app/cards/SpotifyCard';
import type { AudioSpace } from '@/types/audio-spaces.types';

type IconT = ComponentType<{ className?: string }>;

const SpotifyIcon: IconT = ({ className }) => <SpotifyLogo className={className} />;

const KIND: Record<GridCardKind, { key: string; label: string; Icon: IconT }> = {
  stage: { key: 'stage', label: 'Stage', Icon: Mic },
  event: { key: 'event', label: 'Event', Icon: Calendar },
  poll: { key: 'poll', label: 'Poll', Icon: Stats },
  quote: { key: 'quote', label: 'Quote', Icon: Quote },
  sharedPost: { key: 'shared', label: 'Shared', Icon: Feedshare },
  link: { key: 'link', label: 'Link', Icon: Link2 },
  community: { key: 'community', label: 'Community', Icon: Users },
  shop: { key: 'shop', label: 'Shop', Icon: Store },
  profile: { key: 'profile', label: 'Profile', Icon: Profile },
  film: { key: 'film', label: 'Film', Icon: LiveTv },
  bounty: { key: 'bounty', label: 'Bounty', Icon: Bounties },
  app: { key: 'app', label: 'App', Icon: Apps },
  proposal: { key: 'proposal', label: 'Proposal', Icon: Governance },
  short: { key: 'short', label: 'Short', Icon: Shorts },
  comic: { key: 'comic', label: 'Comic', Icon: Packs },
  earn: { key: 'earn', label: 'Earn', Icon: Coins },
  spotify: { key: 'spotify', label: 'Spotify', Icon: SpotifyIcon },
};

/** The pill: what this tile is. `inline` sits in a text poster's flow instead of over a picture. */
export function GridKindPill({ kind, live, inline }: { kind: GridCardKind; live?: boolean; inline?: boolean }) {
  const { t } = useTranslation();
  const { key, label, Icon } = KIND[kind];
  return (
    <span className={`pmg-chip pmg-chip--kind pmg-chip--${kind}${live ? ' pmg-chip--kind-live' : ''}${inline ? ' pmg-chip--inline' : ''}`}>
      {live ? <i className="pmg-kind-dot" /> : <Icon className="pmg-chip-icon" />}
      {live ? t('profile.gridCard.liveStage', 'Live stage') : t(`profile.gridCard.${key}`, label)}
    </span>
  );
}

/** 1240 -> 1.2K, in the reader's own number style. */
const short = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const thumb = (url: string | null | undefined) => (url ? cdnImage(url, { width: deviceWidth(260) }) : undefined);

interface FaceProps {
  /** The post's own words, with the card's link taken out. */
  words: string;
  /** Pinned / Repost chip; it takes the pill's place. */
  chip?: ReactNode;
  /** What to draw while the card loads or when it can't be read. */
  fallback: ReactNode;
}

/** The common face: picture on top, name and one line under it. */
function CoverFace({ kind, live, cover, title, sub, chip }: { kind: GridCardKind; live?: boolean; cover: ReactNode; title: string; sub?: string; chip?: ReactNode }) {
  return (
    <span className={`pmg-mini pmg-mini--${kind}`}>
      <span className="pmg-mini-cover">{cover}</span>
      <span className="pmg-mini-body">
        <span className="pmg-mini-title">{title}</span>
        {sub && <span className="pmg-mini-sub">{sub}</span>}
      </span>
      {chip ?? <GridKindPill kind={kind} live={live} />}
    </span>
  );
}

function StageFace({ stageId, shortId, chip, fallback }: FaceProps & { stageId?: string; shortId?: string }) {
  const { t } = useTranslation();
  // Same key and query as StageLinkEmbed, so the feed card and this tile share one read.
  const { data: stage } = useQuery({
    queryKey: ['stage-by-id', stageId ?? `short:${shortId}`],
    enabled: !!stageId || !!shortId,
    staleTime: 60_000,
    queryFn: async () => {
      const query = supabase.from('audio_spaces').select('*');
      const { data, error } = await (stageId ? query.eq('id', stageId) : query.eq('short_id', Number(shortId))).single();
      if (error) throw error;
      return data as AudioSpace;
    },
  });
  if (!stage) return <>{fallback}</>;
  const live = stage.status === 'live';
  const ended = stage.status === 'ended';
  const startsAt = stage.scheduled_at ? new Date(stage.scheduled_at) : null;
  const sub = live
    ? t('profile.gridCard.listening', { count: Math.max(1, (stage.speaker_count || 1) + (stage.listener_count || 0)), value: short(Math.max(1, (stage.speaker_count || 1) + (stage.listener_count || 0))), defaultValue: '{{value}} listening' })
    : ended
      ? (stage.total_listens ? t('profile.gridCard.listens', { count: stage.total_listens, value: short(stage.total_listens), defaultValue: '{{value}} listens' }) : t('stages.ended', 'Ended'))
      : startsAt
        ? `${format(startsAt, 'EEE HH:mm')}${isPast(startsAt) ? '' : ` · ${formatDistanceToNowStrict(startsAt)}`}`
        : undefined;
  return (
    <CoverFace
      kind="stage"
      live={live}
      chip={chip}
      title={stage.title}
      sub={sub}
      cover={<StageCoverArt src={thumb(stage.cover_image_url)} stage={stage} title={stage.title} />}
    />
  );
}

function EventFace({ eventNumber, chip, fallback }: FaceProps & { eventNumber: string }) {
  const num = parseInt(eventNumber, 10);
  // Same key and query as EventLinkEmbed.
  const { data: event } = useQuery({
    queryKey: ['event-by-number', num],
    enabled: !isNaN(num),
    queryFn: async () => {
      const { data, error } = await supabase.from('community_events').select('*').eq('event_number', num).single();
      if (error) throw error;
      return data as { title: string; starts_at: string; cover_image_url?: string | null };
    },
  });
  if (!event) return <>{fallback}</>;
  const start = new Date(event.starts_at);
  return (
    <CoverFace
      kind="event"
      chip={chip}
      title={event.title}
      sub={format(start, 'EEE d MMM · HH:mm')}
      cover={event.cover_image_url
        ? <img src={thumb(event.cover_image_url)} alt="" loading="lazy" decoding="async" />
        : <span className="pmg-mini-date"><b>{format(start, 'd')}</b>{format(start, 'MMM')}</span>}
    />
  );
}

function PollFace({ tokenId, words, chip, fallback }: FaceProps & { tokenId: number }) {
  const { t } = useTranslation();
  const { data: poll } = usePoll(tokenId);
  if (!poll) return <>{fallback}</>;
  const total = poll.totalVotes || poll.options.reduce((n, o) => n + (o.voteCount || 0), 0);
  return (
    <span className="pmg-mini pmg-mini--poll">
      <span className="pmg-mini-poll">
        <span className="pmg-mini-q">{poll.question || words}</span>
        {poll.options.slice(0, 3).map((o) => {
          const share = total ? o.voteCount / total : 0;
          return (
            <span key={o.index} className="pmg-mini-opt">
              <i style={{ width: `${Math.round(share * 100)}%` }} />
              <b>{o.text}</b>
              <small>{Math.round(share * 100)}%</small>
            </span>
          );
        })}
        <span className="pmg-mini-sub">{t('profile.gridCard.votes', { count: total, value: short(total), defaultValue: '{{value}} votes' })}</span>
      </span>
      {chip ?? <GridKindPill kind="poll" />}
    </span>
  );
}

/** A post inside a post: quotes, and links to another Riftn post. */
function PostInPost({ kind, post, words, chip }: { kind: GridCardKind; post: DeHubNFT; words: string; chip?: ReactNode }) {
  const { thumbnailUrl, gated } = resolveQuotedPostMedia(post);
  const name = post.minterDisplayName || post.mintername || post.minterUsername || '';
  const text = (post.name || post.description || '').replace(/\s+/g, ' ').trim();
  return (
    <span className={`pmg-mini pmg-mini--${kind}`}>
      <span className="pmg-mini-quote">
        {words && <span className="pmg-mini-own">{words}</span>}
        <span className="pmg-mini-quoted">
          {thumbnailUrl && !gated && <img src={thumb(thumbnailUrl)} alt="" loading="lazy" decoding="async" />}
          {name && <b>{name}</b>}
          {text && <span>{text}</span>}
        </span>
      </span>
      {chip ?? <GridKindPill kind={kind} />}
    </span>
  );
}

function SharedPostFace({ tokenId, words, chip, fallback }: FaceProps & { tokenId: string }) {
  // Same key as SharedPostEmbed and the post page.
  const { data: post } = useQuery({
    queryKey: ['single-post', tokenId],
    queryFn: () => getNFTInfo(tokenId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
  if (!post) return <>{fallback}</>;
  return <PostInPost kind="sharedPost" post={post} words={words} chip={chip} />;
}

function LinkFace({ url, chip, fallback }: FaceProps & { url: string }) {
  const { data: preview } = useQuery({
    queryKey: ['grid-link-preview', url],
    queryFn: () => fetchLinkPreview(url),
    initialData: () => peekLinkPreview(url) ?? undefined,
    staleTime: 30 * 60_000,
    retry: false,
  });
  if (!preview?.title) return <>{fallback}</>;
  const image = outsideImage(preview.image);
  return (
    <CoverFace
      kind="link"
      chip={chip}
      title={preview.title}
      sub={preview.siteName || linkHost(url)}
      cover={(
        <>
          {/* The site's name sits under the picture, so a picture that fails to load still leaves something. */}
          <span className="pmg-mini-host">{linkHost(url)}</span>
          {image && <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        </>
      )}
    />
  );
}

/** Thin bar along the tile's foot while its song plays. */
function SpotifyTileBar({ active }: { active: boolean }) {
  const progress = useSpotifyProgress();
  const fillRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const paint = () => {
      const ratio = active && progress.duration ? Math.min(1, spotifyPositionNow(progress) / progress.duration) : 0;
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${ratio})`;
    };
    paint();
    if (!active || !progress.playing) return;
    const timer = window.setInterval(paint, 250);
    return () => window.clearInterval(timer);
  }, [active, progress]);
  return <span className="pmg-spotify-bar" aria-hidden><i ref={fillRef} style={{ transform: 'scaleX(0)' }} /></span>;
}

/**
 * A Spotify post in the grid: the cover over its own blur, like an audio
 * tile, with a green Play that plays it right here. The rest of the tile
 * still opens the post.
 */
function SpotifyFace({ url, link, chip, fallback }: FaceProps & { url: string; link: SpotifyLink }) {
  const { data: preview } = useQuery({
    queryKey: ['grid-link-preview', url],
    queryFn: () => fetchLinkPreview(url),
    initialData: () => peekLinkPreview(url) ?? undefined,
    staleTime: 30 * 60_000,
    retry: false,
  });
  if (!preview?.title) return <>{fallback}</>;
  return <SpotifyFaceBody preview={preview} link={link} chip={chip} />;
}

function SpotifyFaceBody({ preview, link, chip }: { preview: LinkPreviewData; link: SpotifyLink; chip?: ReactNode }) {
  const { t } = useTranslation();
  const item = useSpotifyItem(preview, link);
  const { isCurrent, isPlaying, isLoading, play } = useSpotifyControls(item);
  const ref = useRef<HTMLSpanElement>(null);
  useSpotifyOnScreen(ref, link.uri);
  const image = outsideImage(preview.image);
  const label = isPlaying ? t('spotify.pause', { defaultValue: 'Pause' }) : t('spotify.play', { defaultValue: 'Play' });
  return (
    <span ref={ref} data-on-media className="pmg-mini pmg-spotify" data-playing={isPlaying || undefined} data-spotify-tile>
      {image ? <span className="pmg-audio-blur" style={{ backgroundImage: `url(${image})` }} /> : <span className="pmg-audio-blur pmg-audio-blur--empty" />}
      <span className="pmg-audio-cover">
        {image ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <SpotifyLogo />}
        <span
          role="button"
          tabIndex={0}
          aria-label={`${label}: ${item.title}`}
          data-keep-round
          className="pmg-spotify-play"
          onClick={play}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') play(e); }}
        >
          {isLoading ? <SpotifySpinner /> : isPlaying ? <PauseGlyph /> : <PlayGlyph />}
        </span>
      </span>
      <span className="pmg-spotify-text">
        <span className="pmg-spotify-title">{isCurrent && <SpotifyEq playing={isPlaying} />}<b>{item.title}</b></span>
        <span className="pmg-spotify-sub">{item.subtitle}</span>
      </span>
      {isCurrent && <SpotifyTileBar active={isCurrent} />}
      {chip ?? <GridKindPill kind="spotify" />}
    </span>
  );
}

function CommunityFace({ slug, chip, fallback }: FaceProps & { slug: string }) {
  const { t } = useTranslation();
  const { data: community } = useCommunity(slug);
  if (!community) return <>{fallback}</>;
  const art = community.banner_url || community.avatar_url;
  return (
    <CoverFace
      kind="community"
      chip={chip}
      title={community.name}
      sub={t('profile.gridCard.members', { count: community.member_count ?? 0, value: short(community.member_count ?? 0), defaultValue: '{{value}} members' })}
      cover={art ? <img src={storageImage(art, deviceWidth(260))} alt="" loading="lazy" decoding="async" /> : null}
    />
  );
}

function InviteFace({ code, chip, fallback }: FaceProps & { code: string }) {
  const { t } = useTranslation();
  const { data: invite } = useInvitePreview(code);
  if (!invite?.is_valid || !invite.name) return <>{fallback}</>;
  const art = invite.banner_url || invite.avatar_url;
  return (
    <CoverFace
      kind="community"
      chip={chip}
      title={invite.name}
      sub={typeof invite.member_count === 'number' ? t('profile.gridCard.members', { count: invite.member_count, value: short(invite.member_count), defaultValue: '{{value}} members' }) : undefined}
      cover={art ? <img src={storageImage(art, deviceWidth(260))} alt="" loading="lazy" decoding="async" /> : null}
    />
  );
}

function ProfileFace({ username, chip, fallback }: FaceProps & { username: string }) {
  // Same key as ProfileLinkEmbed.
  const { data: user } = useQuery({
    queryKey: ['profile-link-embed', username.toLowerCase()],
    queryFn: () => getAccountByUsername(username),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });
  // The account payload has grown names over the years; read every spelling ProfileLinkEmbed reads.
  const u = user as (Record<string, string | undefined> & { username?: string }) | undefined;
  const address = u?.address || u?.wallet_address || '';
  if (!u || (!u.username && !address)) return <>{fallback}</>;
  const handle = (u.username || username).replace('@', '');
  const avatar = buildAvatarUrl(address, u.avatarImageUrl || u.avatarUrl || u.avatar_url);
  return (
    <CoverFace
      kind="profile"
      chip={chip}
      title={u.displayName || u.display_name || handle}
      sub={`@${handle}`}
      cover={avatar ? <img src={avatar} alt="" loading="lazy" decoding="async" className="pmg-mini-avatar" /> : null}
    />
  );
}

interface GridCardTileProps extends FaceProps {
  card: TextCard;
  /** On-chain token id of the post: polls hang off it. */
  tokenId: number;
  quotedPost?: DeHubNFT | null;
}

/** The face for a text post that carries a card. Falls back to the poster while loading. */
export function GridCardFace({ card, tokenId, quotedPost, ...face }: GridCardTileProps) {
  const link = card.link;
  switch (card.kind) {
    case 'quote':
      return quotedPost ? <PostInPost kind="quote" post={quotedPost} words={face.words} chip={face.chip} /> : <>{face.fallback}</>;
    case 'stage':
      return <StageFace {...face} stageId={link?.stageId} shortId={link?.stageShortId} />;
    case 'event':
      return link?.eventNumber ? <EventFace {...face} eventNumber={link.eventNumber} /> : <>{face.fallback}</>;
    case 'community':
      if (link?.code) return <InviteFace {...face} code={link.code} />;
      return link?.slug ? <CommunityFace {...face} slug={link.slug} /> : <>{face.fallback}</>;
    case 'shop':
      return <>{face.fallback}</>;
    case 'sharedPost':
      return link?.tokenId ? <SharedPostFace {...face} tokenId={link.tokenId} /> : <>{face.fallback}</>;
    case 'profile':
      return link?.username ? <ProfileFace {...face} username={link.username} /> : <>{face.fallback}</>;
    case 'link':
      return card.url ? <LinkFace {...face} url={card.url} /> : <>{face.fallback}</>;
    case 'spotify': {
      const song = parseSpotifyLink(card.url);
      return card.url && song ? <SpotifyFace {...face} url={card.url} link={song} /> : <>{face.fallback}</>;
    }
    case 'poll':
      return <PollFace {...face} tokenId={tokenId} />;
    default:
      // Film, bounty, app and proposal links: the poster with its pill.
      return <>{face.fallback}</>;
  }
}

/**
 * A text post with no link may still carry a poll; the feed API has no
 * "has poll" flag, so ask (batched, one request per page of tiles).
 */
export function GridPollProbe({ tokenId, words, chip, fallback, poster }: FaceProps & { tokenId: number; poster: ReactNode }) {
  const { data: poll } = usePoll(tokenId, tokenId > 0);
  if (!poll) return <>{poster}</>;
  return <PollFace tokenId={tokenId} words={words} chip={chip} fallback={fallback} />;
}
