/**
 * Spend one SuperPower, from the SuperPowers page
 * ==============================================
 * Every bento on `/app/superpowers` that this account actually holds is a
 * button, and this is what opens behind it.
 *
 * The page used to tick a power and then leave you to find the surface it is
 * spent from — a post's menu, a comment, a Stage. At Cobra that was five ticks
 * and one control; at Meglodon it is twelve ticks and two, which reads as ten
 * powers that do not work. They all work. What they need is a target,
 * and picking the target is the whole job of this drawer.
 *
 * **One box, two behaviours.** The post picker takes a search term *or* a
 * pasted link. Paste `https://dehub.io/app/post/2008`, the path on its own, or
 * the bare number, and it resolves that one post; type anything else and it
 * searches. Two separate inputs was the first draft, and it made the person
 * decide which one they were doing before they had done it.
 *
 * **Only offer what the server will accept.** Every refusal in
 * `superpower.service.ts` runs before the allowance is taken, so a bad pick
 * costs nothing — but it still reads as broken, which is the thing being
 * fixed. So Boost lists only posts under a week old and Second Wind only older
 * ones, Deep Current hides your own posts because it is a gift, and Front Row
 * lists only Stages you host that have not ended. One rule is left to the
 * server: Comment Anchor's "somebody else's thread". The comments API does not
 * return the post's author, and resolving one request per row would spend the
 * per-IP budget on a list most of which is never picked.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, Check, X, SquarePen, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getCategories, getNFTInfo, searchNFTs, getUserComments } from '@/lib/api/dehub';
import { supabase } from '@/integrations/supabase/client';
import { buildFeedImageUrls, buildImageUrl } from '@/lib/media-url';
import {
  powerHome,
  useBookBoost,
  useSuperpowerLadder,
  useSuperpowers,
} from '@/hooks/use-superpowers';
import { FRONT_ROW_STATUSES, ageSuits, postIdFromInput } from '@/lib/spend-power-target';
import {
  waitForSignalFlareReceipt,
  type SuperPowerInfo,
} from '@/lib/api/dehub/superpowers';

interface SpendPowerDrawerProps {
  /** The power being spent. Null closes the drawer. */
  power: SuperPowerInfo | null;
  onOpenChange: (open: boolean) => void;
}

export function SpendPowerDrawer({ power, onOpenChange }: SpendPowerDrawerProps) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const { data: status } = useSuperpowers();
  const { data: ladder } = useSuperpowerLadder();
  const book = useBookBoost();

  const [query, setQuery] = useState('');
  const [pickedPost, setPickedPost] = useState<number | null>(null);
  const [pickedComment, setPickedComment] = useState<string | null>(null);
  const [pickedStage, setPickedStage] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [targetAccount, setTargetAccount] = useState('');
  const [targetTiers, setTargetTiers] = useState<string[]>([]);

  const open = !!power;
  const home = power ? powerHome(power.key) : 'post';
  const me = walletAddress?.toLowerCase();

  // Reset between openings. A drawer that remembers the post you picked for a
  // different power is one tap from spending on the wrong thing.
  useEffect(() => {
    if (open) return;
    setQuery('');
    setPickedPost(null);
    setPickedComment(null);
    setPickedStage(null);
    setCategory('');
    setTargetAccount('');
    setTargetTiers([]);
  }, [open]);

  const pastedId = postIdFromInput(query);
  const wantsPosts = open && (home === 'post' || home === 'gift');

  /** A pasted link resolves to exactly one post, fetched by id. */
  const { data: pastedPost, isFetching: resolvingPaste } = useQuery({
    queryKey: ['spend-power-paste', pastedId],
    queryFn: () => getNFTInfo(String(pastedId)),
    enabled: wantsPosts && pastedId !== null,
    retry: false,
    staleTime: 60_000,
  });

  /**
   * Anything else is a search. Scoped to this account for the powers that act
   * on your own post, and deliberately unscoped for the one gift — the
   * `creator_id` is the only difference between the two.
   */
  const { data: found, isFetching: searching } = useQuery({
    queryKey: ['spend-power-search', home, me, query],
    queryFn: () =>
      searchNFTs({
        creator_id: home === 'gift' ? undefined : me,
        search: query.trim() || undefined,
        sortMode: 'new',
        unit: 30,
        page: 0,
      }),
    enabled: wantsPosts && pastedId === null && (home !== 'gift' || query.trim().length > 1),
    staleTime: 30_000,
  });

  /** My recent comments, for the Anchor. */
  const { data: comments, isFetching: loadingComments } = useQuery({
    queryKey: ['spend-power-comments', me],
    queryFn: () => getUserComments(me!, 1, 30),
    enabled: open && home === 'comment' && !!me,
    staleTime: 30_000,
  });

  /** Stages I host that have not ended, for the Front Row. */
  const { data: stages, isFetching: loadingStages } = useQuery({
    queryKey: ['spend-power-stages', me],
    queryFn: async () => {
      const { data } = await supabase
        .from('audio_spaces')
        .select('id, title, status, scheduled_at, started_at')
        .ilike('host_wallet_address', me!)
        .in('status', FRONT_ROW_STATUSES)
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: open && home === 'stage' && !!me,
    staleTime: 30_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['dehub-categories'],
    queryFn: getCategories,
    enabled: open && power?.key === 'trend_jacker',
    staleTime: 60 * 60 * 1000,
  });

  const tierNames = (ladder?.tiers ?? []).map(row => row.name).filter(Boolean) as string[];

  /**
   * The posts on offer, newest first.
   *
   * A pasted id short-circuits the list. Everything else is filtered on the
   * two rules the client can check without another request: the age line, and
   * the gift's inversion of ownership.
   */
  const posts = useMemo(() => {
    const rows = pastedId !== null ? (pastedPost ? [pastedPost] : []) : (found?.data ?? []);
    return rows.filter(row => {
      if (!ageSuits(power?.key, row?.createdAt)) return false;
      if (home !== 'gift') return true;
      // A gift only lands on somebody else's post. An unknown author is left
      // in and refused by the server rather than hidden.
      const author = row?.minter ? String(row.minter).toLowerCase() : null;
      return !author || !me || author !== me;
    });
  }, [pastedId, pastedPost, found?.data, power?.key, home, me]);

  const signals = power?.key === 'signal_flare';
  const left = signals ? (status?.signalsLeft ?? status?.boostsLeft ?? 0) : (status?.boostsLeft ?? 0);
  const statusTier = (status?.tier ?? '').toLowerCase();
  const isMegalodon =
    statusTier.includes('megalodon') ||
    statusTier.includes('meglodon');

  const selectedPost =
    home === 'post' || home === 'gift'
      ? posts.find(row => Number(row.tokenId) === pickedPost)
      : null;

  const signalFlarePeople = signals
    ? Number(
        (selectedPost as any)?.creator?.followers ??
          (selectedPost as any)?.creator?.follower_count ??
          (selectedPost as any)?.followers ??
          (selectedPost as any)?.followerCount ??
          (selectedPost as any)?.creator?.followersList?.length ??
          (selectedPost as any)?.followersList?.length ??
          0,
      )
    : null;

  const targetChosen =
    home === 'page'
      ? !!category
      : home === 'comment'
        ? !!pickedComment
        : home === 'stage'
          ? !!pickedStage
          : pickedPost !== null;

  const targetingChosen =
    power?.key === 'precision_strike'
      ? targetAccount.trim().length > 0
      : power?.key === 'harpoon'
        ? targetTiers.length > 0
        : true;

  const canSpend = !!power && left > 0 && targetChosen && targetingChosen && !book.isPending;

  const handleSpend = () => {
    if (!power || !canSpend) return;
    book.mutate(
      {
        tokenId: home === 'post' || home === 'gift' ? (pickedPost as number) : 0,
        power: power.key,
        category: power.key === 'trend_jacker' ? category : undefined,
        commentId: home === 'comment' ? (pickedComment as string) : undefined,
        stageId: home === 'stage' ? (pickedStage as string) : undefined,
        targetAccount: power.key === 'precision_strike' ? targetAccount.trim() : undefined,
        targetTiers: power.key === 'harpoon' ? targetTiers : undefined,
      },
      {
        onSuccess: booking => {
          if (power.key === 'signal_flare') {
            toast.promise(waitForSignalFlareReceipt(booking.id), {
              loading: 'Signal Flare sent. Counting notifications...',
              success: recipients =>
                recipients === null
                  ? 'Signal Flare sent. The final count will appear in Past usage.'
                  : `Signal Flare notified ${recipients} ${recipients === 1 ? 'person' : 'people'}`,
              error: 'Signal Flare sent. The final count will appear in Past usage.',
            });
          } else {
            toast.success(
              t('superpowers.spentFor', {
                power: power.label,
                minutes: booking.minutes,
                defaultValue: `${power.label} running for ${booking.minutes} minutes`,
              }),
            );
          }
          onOpenChange(false);
        },
        // The server writes these sentences for a person to read — "Post in
        // that category first", "That post is over a week old". Show them.
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : t('superpowers.boostFailed')),
      },
    );
  };

  const loadingPosts = resolvingPaste || searching;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="px-4 pb-6">
        <DrawerHeader className="pb-2 flex flex-row items-center justify-between gap-3">
          <DrawerTitle className="text-white text-lg">{power?.label}</DrawerTitle>
          {/* shadcn's DialogContent renders its own X; DrawerContent does not,
              and this body scrolls — the scrim should not be the only exit. */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            className="text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          <p className="text-[13px] text-zinc-400 leading-snug px-1">{power?.summary}</p>

          {power?.key === 'trend_jacker' && (
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg text-white text-sm px-3 py-2"
            >
              <option value="">{t('superpowers.pickCategory')}</option>
              {categories.map(c => (
                <option key={c.name} value={c.name} className="bg-zinc-900">
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {(home === 'post' || home === 'gift') && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value);
                    setPickedPost(null);
                  }}
                  placeholder={
                    home === 'gift'
                      ? t('superpowers.findTheirPost', {
                          defaultValue: 'Paste their post link, or search',
                        })
                      : t('superpowers.findMyPost', {
                          defaultValue: 'Search your posts, or paste a link',
                        })
                  }
                  className="bg-white/5 border-white/10 pl-9"
                />
              </div>

              <div className="flex flex-col gap-1">
                {loadingPosts && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                  </div>
                )}

                {!loadingPosts && posts.length === 0 && (
                  <p className="text-[12px] text-zinc-500 px-1 py-4">
                    {home === 'gift' && query.trim().length < 2
                      ? t('superpowers.searchToGift', {
                          defaultValue: 'Search for a post, or paste a link to one.',
                        })
                      : power?.key === 'boost'
                        ? t('superpowers.noRecentPosts', {
                            defaultValue:
                              'Nothing here from the last week. Anything older takes a Second Wind.',
                          })
                        : power?.key === 'second_wind'
                          ? t('superpowers.noOlderPosts', {
                              defaultValue:
                                'Nothing here older than a week. Anything newer takes a Boost.',
                            })
                          : t('superpowers.noPostsFound', { defaultValue: 'No posts found.' })}
                  </p>
                )}

                {posts.map(post => {
                  const id = Number(post.tokenId);
                  const picked = pickedPost === id;
                  // The feed returns a CDN PATH, not a URL — `images/4208.jpg`.
                  // Straight into an <img src> that asks this origin for it and
                  // comes back as the SPA's index.html, which draws nothing.
                  const thumb = post.imageUrl
                    ? buildImageUrl(id, post.imageUrl, 96)
                    : post.thumbnail_url
                      ? buildImageUrl(id, post.thumbnail_url, 96)
                      : (buildFeedImageUrls(post.imageUrls, 96) ?? [])[0];
                  const postText = String(post.description ?? '').trim();
                  const postTitle = String(post.name ?? post.title ?? '').trim();
                  const hasVideo = Boolean(
                    post.videoUrl || post.media_url || post.postType === 'video' || post.media_type === 'video',
                  );
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPickedPost(picked ? null : id)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-2 text-left transition-colors',
                        picked ? 'border-white/40 bg-white/10' : 'border-white/10 hover:bg-white/5',
                      )}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          className="w-12 h-12 rounded-lg object-cover shrink-0 bg-white/5"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-white/[0.07] shrink-0 flex items-center justify-center">
                          {hasVideo ? (
                            <Play className="w-5 h-5 text-zinc-400" aria-hidden="true" />
                          ) : (
                            <SquarePen className="w-5 h-5 text-zinc-400" aria-hidden="true" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white line-clamp-2 leading-snug">
                          {postText || postTitle || `Post #${id}`}
                        </p>
                        {postText && postTitle && postTitle !== postText && (
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">{postTitle}</p>
                        )}
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : `#${id}`}
                        </p>
                      </div>
                      {picked && <Check className="w-4 h-4 text-green-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {home === 'comment' && (
            <div className="flex flex-col gap-1">
              <p className="text-[12px] text-zinc-500 px-1">
                {t('superpowers.anchorNeedsTheirThread', {
                  defaultValue:
                    "An Anchor holds your comment at the top of somebody else's thread — on your own post a pin is already free.",
                })}
              </p>
              {loadingComments && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                </div>
              )}
              {!loadingComments && (comments?.data ?? []).length === 0 && (
                <p className="text-[12px] text-zinc-500 px-1 py-4">
                  {t('superpowers.noComments', { defaultValue: 'You have not commented yet.' })}
                </p>
              )}
              {(comments?.data ?? []).map(comment => {
                const picked = pickedComment === comment.id;
                return (
                  <button
                    key={comment.id}
                    type="button"
                    onClick={() => setPickedComment(picked ? null : comment.id)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      picked ? 'border-white/40 bg-white/10' : 'border-white/10 hover:bg-white/5',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white line-clamp-2">{comment.content}</p>
                      <p className="text-[11px] text-zinc-500">
                        #{comment.tokenId} · {new Date(comment.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {picked && <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          )}

          {home === 'stage' && (
            <div className="flex flex-col gap-1">
              {loadingStages && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                </div>
              )}
              {!loadingStages && (stages ?? []).length === 0 && (
                <p className="text-[12px] text-zinc-500 px-1 py-4">
                  {t('superpowers.noStages', {
                    defaultValue: 'No Stage of yours is live or scheduled right now.',
                  })}
                </p>
              )}
              {(stages ?? []).map(stage => {
                const picked = pickedStage === stage.id;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setPickedStage(picked ? null : stage.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                      picked ? 'border-white/40 bg-white/10' : 'border-white/10 hover:bg-white/5',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{stage.title}</p>
                      <p className="text-[11px] text-zinc-500">{stage.status}</p>
                    </div>
                    {picked && <Check className="w-4 h-4 text-green-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {power?.key === 'precision_strike' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-zinc-400 px-1">
                {t('superpowers.aimAtAccount')}
              </label>
              <Input
                value={targetAccount}
                onChange={e => setTargetAccount(e.target.value)}
                placeholder={t('superpowers.aimPlaceholder')}
                className="bg-white/5 border-white/10"
              />
            </div>
          )}

          {power?.key === 'harpoon' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-zinc-400 px-1">{t('superpowers.aimAtTiers')}</label>
              <div className="flex flex-wrap gap-1.5">
                {tierNames.map(name => {
                  const picked = targetTiers.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() =>
                        setTargetTiers(prev =>
                          prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name],
                        )
                      }
                      className={cn(
                        'rounded-full border px-3 py-1 text-[12px] transition-colors',
                        picked
                          ? 'border-white/40 bg-white/15 text-white'
                          : 'border-white/10 text-zinc-400 hover:bg-white/5',
                      )}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Button
          onClick={handleSpend}
          disabled={!canSpend}
          className={cn('w-full mt-3', !canSpend && 'opacity-50')}
        >
          {book.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : left < 1 ? (
            // A Signal Flare comes out of a second pot the same size as the
            // boost one, so "no boosts left" is the wrong sentence for it.
            signals ? (
              t('superpowers.noFlaresLeft', { defaultValue: 'No Signal Flares left this cycle' })
            ) : (
              t('superpowers.noBoostsLeft')
            )
          ) : (
            signals
              ? isMegalodon
                ? 'Signal Flare to everyone'
                : t('superpowers.signalFlareTo', {
                    people: signalFlarePeople ?? 0,
                    defaultValue: `Signal Flare to ${(signalFlarePeople ?? 0).toLocaleString()} people`,
                  })
              : t('superpowers.spendFor', {
                  power: power?.label ?? '',
                  minutes: status?.minutesPerBoost ?? 0,
                  defaultValue: `${power?.label ?? 'Spend'} for ${status?.minutesPerBoost ?? 0} minutes`,
                })
          )}
        </Button>
      </DrawerContent>
    </Drawer>
  );
}
