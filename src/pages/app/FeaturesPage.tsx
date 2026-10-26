import { translateCopy as _translateCopy } from '@/i18n/copy';
import { FeedSwallowMotion } from '@/components/app/feeds/FeedSwallowMotion';
import { useTranslation as _useCopy } from 'react-i18next';
import i18n from '@/i18n';
import { formatRelativeTime } from '@/i18n/date-locale';
import { useSurfaceDraft, draftIdentity } from '@/hooks/use-surface-draft';
/**
 * Feature Requests Page
 * =====================
 * Community-driven feature request board.
 * Users can submit ideas and vote on existing ones.
 * Feature cards use the same UI pattern as text posts (ActionBar + CommentsWrapper).
 */

import { BrandIcon, ThemedIcon } from '@/components/app/war/WarHudIcon';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useFormDraft } from '@/hooks/use-form-draft';
import { useTranslation as useI18n } from 'react-i18next';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { useScrollFadeMask } from '@/components/app/feeds/useScrollFadeMask';
import { Loader2, CheckCircle2, MoreVertical, ImagePlus } from "lucide-react";
import Sparkles from "@/components/ui/cut-icons/assistant";
import Trash2 from "@/components/ui/cut-icons/delete";
import Pencil from "@/components/ui/cut-icons/edit";

import Search from "@/components/ui/cut-icons/search";
import Plus from "@/components/ui/cut-icons/add";
import X from "@/components/ui/cut-icons/close";
import { ImageMarkupDialog } from '@/components/app/features/ImageMarkupDialog';

import featuresLightbulb from '@/assets/features-lightbulb.png';
import { TranslatableText, SharedTranslationProvider, useSharedTranslationControl } from '@/components/app/TranslatableText';
import { PostMetadata } from '@/components/app/cards/PostMetadata';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { featurePromptFields } from '@/lib/feature-prompt';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { ActionBar } from '@/components/app/cards/ActionBar';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { buildAvatarUrl } from '@/lib/media-url';
import { useProfileAvatar } from '@/hooks/use-profile-avatar-cache';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { supabase } from '@/integrations/supabase/client';
import {
  useFeatureRequests,
  useFeatureRequest,
  useShippedFeatures,
  useInProgressFeatures,

  useUserVotes,
  useFeatureCounts,
  useSubmitFeatureRequest,
  useVoteFeatureRequest,
  useEditFeatureRequest,
  useDeleteFeatureRequest,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type FeatureCategory,
  type FeatureSort,
  type FeatureStatus,
  type FeatureRequest,
} from '@/hooks/use-feature-requests';
import {
  featureAttachments,
  isVideoAttachment,
  MAX_FEATURE_ATTACHMENTS,
  MAX_FEATURE_ATTACHMENT_BYTES,
} from '@/lib/feature-attachments';
import { z } from 'zod';
import { FeatureRequestComments } from '@/components/app/features/FeatureRequestComments';
import { SEOHead } from '@/components/SEOHead';

// Built per use so its messages are read in the reader's language at the time.
const featureSchema = () => z.object({
  title: z.string().trim().min(1, _translateCopy("copy.d5b06872b556", { defaultValue: "Title is required" })).max(100, _translateCopy("copy.8b4f83e9c989", { defaultValue: "Title must be under 100 characters" })),
  description: z.string().trim().min(1, _translateCopy("copy.032d33c52dda", { defaultValue: "Description is required" })).max(1000, _translateCopy("copy.d69c0b196525", { defaultValue: "Description must be under 1,000 characters" })),
  category: z.enum(['ui_ux', 'performance', 'new_feature', 'bug_fix', 'integration', 'other']),
});

const CATEGORIES: { id: FeatureCategory | 'all'; labelKey: string }[] = [
  { id: 'all', labelKey: 'features.all' },
  { id: 'ui_ux', labelKey: 'features.uiUx' },
  { id: 'performance', labelKey: 'features.performance' },
  { id: 'new_feature', labelKey: 'features.newFeature' },
  { id: 'bug_fix', labelKey: 'features.bugFix' },
  { id: 'integration', labelKey: 'features.integration' },
  { id: 'other', labelKey: 'features.other' },
];

type PageTab = 'requests' | 'shipping' | 'shipped';

const SORTS: { id: FeatureSort; labelKey: string }[] = [
  { id: 'most_voted', labelKey: 'features.mostVoted' },
  { id: 'newest', labelKey: 'features.newest' },
];

// Statuses worth surfacing on an open request. `open` is the default and adds
// no information, and shipped/completed live on their own tab with their own
// badge — so both are deliberately absent here and render nothing.
//
// Hues match mobile's STATUS_COLORS (dehub-mobile/hooks/useFeatureRequests.ts)
// so the same request reads the same on both clients: amber = under review,
// blue = planned, violet = in progress, red = declined.
const STATUS_BADGE_STYLES: Partial<Record<FeatureStatus, string>> = {
  under_review: 'bg-amber-400/15 text-amber-300/90 border-amber-300/25',
  planned: 'bg-blue-400/15 text-blue-300/90 border-blue-300/25',
  in_progress: 'bg-violet-400/15 text-violet-300/90 border-violet-300/25',
  declined: 'bg-red-400/15 text-red-300/90 border-red-300/25',
};

/**
 * A request's attachments. One fills the card the way a single attachment
 * always has; several tile so a multi-screenshot bug report stays scannable
 * without pushing the vote controls off screen.
 */
/**
 * A single attachment, with its space reserved before it arrives.
 *
 * These images are lazy, and an `<img>` that has not loaded has no intrinsic
 * height — so `w-full max-h-64` alone gave a box 677px wide and 0px tall. A
 * card whose screenshot has not scrolled into view therefore rendered as if it
 * had no attachment at all, which is exactly how "see screenshot" reports get
 * read as having no screenshot. Holding 16rem (the same 64 the loaded image is
 * capped at) until `onLoad` also stops every card below it jumping down the
 * page as attachments arrive.
 */
function LazyAttachmentImage({ url }: { url: string }) {
  const { t: _copy } = _useCopy();
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn('relative w-full', !loaded && 'h-64 animate-pulse bg-white/[0.04]')}>
      <img
        src={url}
        alt={_copy("copy.040d2b3689dd", { defaultValue: "Attachment" })}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        // Errors must not strand the skeleton pulsing forever — settle the box
        // and let the browser show its own broken-image state.
        onError={() => setLoaded(true)}
        className={cn(
          'w-full max-h-64 object-contain bg-black/30 transition-opacity duration-300',
          loaded ? 'opacity-100' : 'absolute inset-0 h-full opacity-0'
        )}
      />
    </div>
  );
}

function FeatureAttachments({ feature }: { feature: FeatureRequest }) {
  const { t: _copy } = _useCopy();
  const urls = featureAttachments(feature);
  if (urls.length === 0) return null;

  if (urls.length === 1) {
    const url = urls[0];
    return (
      <div data-media-full className="rounded-xl overflow-hidden border border-white/10">
        {isVideoAttachment(url) ? (
          <video src={url} className="w-full max-h-64 object-contain bg-black" controls />
        ) : (
          <LazyAttachmentImage url={url} />
        )}
      </div>
    );
  }

  return (
    <div data-media-full className="grid grid-cols-2 gap-1.5">
      {urls.map((url, index) => (
        <div key={url} className="rounded-xl overflow-hidden border border-white/10 aspect-video bg-black/30">
          {isVideoAttachment(url) ? (
            <video src={url} className="w-full h-full object-cover" controls preload="metadata" />
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
              <img
                src={url}
                alt={_copy("copy.9010b5b17d48", { defaultValue: "Attachment {{value1}} of {{value2}}", value1: index + 1, value2: urls.length })}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: FeatureStatus }) {
  const style = STATUS_BADGE_STYLES[status];
  if (!style) return null;
  return (
    <span
      className={cn(
        'text-[10px] font-medium px-2 py-0.5 rounded-lg border backdrop-blur-xl whitespace-nowrap',
        style
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatTimeAgo(dateStr: string): string {
  return formatRelativeTime(dateStr, i18n.language, 'short');
}

// ──────────────────────────────────────────────────
// Feature Card Component (PostCard-style UI)
// ──────────────────────────────────────────────────
function FeatureCard({
  feature,
  currentVote,
  onVote,
  voteDisabled,
  defaultCommentsOpen = false,
  focusCommentId = null,
}: {
  feature: FeatureRequest;
  currentVote: number | undefined;
  onVote: (featureId: string, voteType: 1 | -1, currentVote: number | undefined) => void;
  voteDisabled: boolean;
  /** Open the comments on mount — set by a comment notification's deep link. */
  defaultCommentsOpen?: boolean;
  /** The comment that deep link was about, ringed once the thread is open. */
  focusCommentId?: string | null;
}) {
  const { t: _copy } = _useCopy();
  const { t } = useI18n();
  const { isTranslated, isLoading: isTranslateLoading, error: translateError, handleTranslate, handleShowOriginal } = useSharedTranslationControl();
  const [showComments, setShowComments] = useState(defaultCommentsOpen);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useSurfaceDraft("src/pages/app/FeaturesPage.tsx:editTitle", feature.title, feature.id);
  const [editDescription, setEditDescription] = useSurfaceDraft("src/pages/app/FeaturesPage.tsx:editDescription", feature.description, feature.id);
  const [editCategory, setEditCategory] = useState<FeatureCategory>(feature.category);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();

  const editMutation = useEditFeatureRequest();
  const deleteMutation = useDeleteFeatureRequest();

  const isAuthor = walletAddress && feature.author_wallet_address.toLowerCase() === walletAddress.toLowerCase();

  const dbAvatarUrl = feature.author_avatar
    ? buildAvatarUrl(feature.author_wallet_address, feature.author_avatar)
    : undefined;
  const walletAvatarUrl = useProfileAvatar(feature.author_wallet_address, dbAvatarUrl);
  const usernameAvatarUrl = useProfileAvatar(
    feature.author_username && feature.author_username.toLowerCase() !== feature.author_wallet_address.toLowerCase()
      ? feature.author_username
      : undefined
  );
  const avatarUrl = walletAvatarUrl ?? usernameAvatarUrl ?? dbAvatarUrl ?? null;

  const displayName = feature.author_username || feature.author_wallet_address.slice(0, 6);
  const handle = feature.author_username ? `@${feature.author_username}` : `${feature.author_wallet_address.slice(0, 6)}...${feature.author_wallet_address.slice(-4)}`;

  // Determine like/dislike state from currentVote
  const isLiked = currentVote === 1;
  const isDisliked = currentVote === -1;

  const handleLike = useCallback(() => {
    onVote(feature.id, 1, currentVote);
  }, [feature.id, currentVote, onVote]);

  const handleDislike = useCallback(() => {
    onVote(feature.id, -1, currentVote);
  }, [feature.id, currentVote, onVote]);

  const handleEdit = () => {
    setEditTitle(feature.title);
    setEditDescription(feature.description);
    setEditCategory(feature.category);
    setIsEditing(true);
    setShowMenu(false);
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim() || !editDescription.trim()) return;
    editMutation.mutate(
      { id: feature.id, title: editTitle, description: editDescription, category: editCategory },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const handleDelete = () => {
    setShowMenu(false);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate(feature.id, {
      onSuccess: () => setShowDeleteConfirm(false),
    });
  };

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  return (
    <div
      id={`feature-${feature.id}`}
      className="overflow-visible relative rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3 scroll-mt-52"
    >
      {/* Header with three-dot menu */}
      <div className="flex items-start">
        <CardHeader
          username={displayName}
          handle={handle}
          avatarSeed={avatarUrl || ''}
          verified={false}
          contentType="post"
          creatorId={feature.author_wallet_address}
          creatorUsername={feature.author_username || undefined}
          badgeLookupId={feature.author_username || feature.author_wallet_address}
          timestamp={formatTimeAgo(feature.created_at)}
        />
        {isAuthor && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu(prev => !prev)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <div data-glass-menu className="absolute right-0 top-9 z-50 w-36 rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-xl overflow-hidden">
                <button
                  type="button"
                  onClick={handleEdit}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />{_copy("copy.464c4ffd019e", { defaultValue: "Edit" })}</button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />{_copy("copy.e2d0a54968ea", { defaultValue: "Delete" })}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="mb-3 p-3 rounded-lg border border-red-500/20 bg-red-500/5">
          <p className="text-sm text-zinc-300 mb-2">{_copy("copy.bc9f6ccb582d", { defaultValue: "Are you sure you want to delete this feature request?" })}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="rounded-lg text-xs"
            >
              {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : _copy("copy.e2d0a54968ea", { defaultValue: "Delete" })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg text-xs text-zinc-400"
            >{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</Button>
          </div>
        </div>
      )}

      {/* Content — editable or read-only */}
      <div className="pt-1 space-y-2">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-zinc-500 text-xs mb-1 block">{_copy("copy.7e8cd2056da7", { defaultValue: "Title" })}</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={100}
                className="bg-zinc-800/50 border-white/10 text-white rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-zinc-500 text-xs mb-1 block">{_copy("copy.526e0087cc3f", { defaultValue: "Description" })}</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                className="w-full bg-zinc-800/50 border border-white/10 text-white rounded-lg text-sm p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            <div>
              <label className="text-zinc-500 text-xs mb-1 block">{_copy("copy.292c06f0045a", { defaultValue: "Category" })}</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as FeatureCategory)}
                className="w-full bg-zinc-800/50 border border-white/10 text-white rounded-lg text-sm p-2 focus:outline-none focus:ring-1 focus:ring-white/20"
              >
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="glass"
                onClick={handleSaveEdit}
                disabled={editMutation.isPending || !editTitle.trim() || !editDescription.trim()}
                className="rounded-lg text-xs"
              >
                {editMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : _copy("copy.1509f561f241", { defaultValue: "Save" })}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(false)}
                className="rounded-lg text-xs text-zinc-400"
              >{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</Button>
            </div>
          </div>
        ) : (
          <>
            <TranslatableText publicContent text={feature.title} className="text-white font-semibold text-sm leading-tight" as="h3" hideControls />
            {feature.description !== feature.title && <TranslatableText publicContent text={feature.description} className="text-zinc-400 text-sm leading-relaxed" as="p" />}

            {/* Attached media — one full-width, several as a grid */}
            <FeatureAttachments feature={feature} />

        {/* Category + status badges - liquid glass style */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-300 text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gradient-to-br from-white/15 via-white/8 to-white/3 backdrop-blur-xl border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.3)]">
            {CATEGORY_LABELS[feature.category]}
          </span>
          <StatusBadge status={feature.status} />
        </div>

        {/* Translate control */}
        <PostMetadata
          timestamp={feature.created_at}
          translateControl={{
            isTranslated,
            isLoading: isTranslateLoading,
            error: translateError,
            onTranslate: handleTranslate,
            onShowOriginal: handleShowOriginal,
          }}
        />

        <div className="pt-1">
          <ActionBar
            postId={feature.id}
            className="p-0"
            onComment={() => setShowComments(prev => !prev)}
            onLike={handleLike}
            onDislike={handleDislike}
            isLiked={isLiked}
            isDisliked={isDisliked}
            likeCount={feature.like_count ?? 0}
            dislikeCount={feature.dislike_count ?? 0}
            commentCount={feature.comment_count}
          />
        </div>
          </>
        )}

        {/* Comments — the post comment section's thread, on this board's data. */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <FeatureRequestComments
                featureRequestId={feature.id}
                featureTitle={feature.title}
                featureAuthorAddress={feature.author_wallet_address}
                focusCommentId={focusCommentId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Submit Feature Drawer
// ──────────────────────────────────────────────────
function PromptComposer({ initialCategory, focusRequest, onPosted }: { initialCategory?: FeatureCategory; focusRequest: number; onPosted: () => void }) {
  const { t } = useI18n();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deviceDetails, setDeviceDetails] = useState('');
  const [category, setCategory] = useState<FeatureCategory>('new_feature');
  const [attachments, setAttachments] = useState<{ file: File; preview: string }[]>([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const previewsRef = useRef(attachments);
  previewsRef.current = attachments;
  const submitMutation = useSubmitFeatureRequest();
  const draft = useFormDraft('feature-request', { title, description, deviceDetails }, (saved) => {
    if (saved.title !== undefined) setTitle(saved.title);
    if (saved.description !== undefined) setDescription(saved.description);
    if (saved.deviceDetails !== undefined) setDeviceDetails(saved.deviceDetails);
  });

  useEffect(() => { if (initialCategory) setCategory(initialCategory); }, [initialCategory]);
  useEffect(() => {
    if (focusRequest) {
      promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      promptRef.current?.focus({ preventScroll: true });
    }
  }, [focusRequest]);
  useEffect(() => () => previewsRef.current.forEach(a => URL.revokeObjectURL(a.preview)), []);

  const addFiles = (picked: File[]) => {
    if (submitMutation.isPending) return;
    const valid = picked.filter(file => /^(image|video)\//.test(file.type) && file.size <= MAX_FEATURE_ATTACHMENT_BYTES);
    const room = Math.max(0, MAX_FEATURE_ATTACHMENTS - attachments.length);
    const accepted = valid.slice(0, room);
    setAttachments(prev => [...prev, ...accepted.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
    setError(valid.length < picked.length
      ? t('features.promptMediaError', 'Choose images or videos under 50MB each.')
      : accepted.length < picked.length
        ? t('features.promptMediaLimit', 'Up to {{max}} attachments.', { max: MAX_FEATURE_ATTACHMENTS }) : '');
  };
  const [markupIndex, setMarkupIndex] = useState<number | null>(null);
  const replaceAttachment = (index: number, file: File) => {
    setAttachments(prev => prev.map((a, i) => {
      if (i !== index) return a;
      URL.revokeObjectURL(a.preview);
      return { file, preview: URL.createObjectURL(file) };
    }));
    setMarkupIndex(null);
  };
  const removeAttachment = (index: number) => {
    URL.revokeObjectURL(attachments[index].preview);
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setError('');
  };
  const handleSubmit = () => {
    if (!description.trim() || submitMutation.isPending) return;
    if (!isAuthenticated) { openLoginModal(); return; }
    const prompt = description.trim();
    const result = featureSchema().safeParse({
      title: featurePromptFields(prompt, title).title,
      description: prompt, category,
    });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setError('');
    submitMutation.mutate({
      title: featurePromptFields(prompt, title).title,
      category,
      description: featurePromptFields(prompt, title, deviceDetails).description,
      mediaFiles: attachments.map(a => a.file),
    }, { onSuccess: () => {
      if (!draft.clear()) return;
      setTitle(''); setDescription(''); setDeviceDetails('');
      setCategory(initialCategory || 'new_feature');
      previewsRef.current.forEach(a => URL.revokeObjectURL(a.preview));
      setAttachments([]);
      onPosted();
    } });
  };

  return (
    <section data-page-bento data-feature-composer className="rounded-2xl bg-zinc-900 p-4 sm:p-6 mb-3"
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}>
      <h2 className="text-base sm:text-lg font-semibold text-white mb-1">{t('features.promptHeading', 'What should we build next?')}</h2>
      <p className="text-xs text-zinc-400 mb-3">{t('features.promptHint', 'Describe it. Drop in a screenshot. Make it happen.')}</p>
      <div className={cn('rounded-xl border border-white/15 bg-black/10 p-3 transition-colors focus-within:border-white/40', dragging && 'ring-2 ring-current')}>
        <textarea ref={promptRef} value={description} onChange={e => setDescription(e.target.value)}
          aria-label={t('features.promptLabel', 'Your prompt')}
          placeholder={t('features.promptPlaceholder', 'Describe an idea, improvement, or bug…')}
          maxLength={1000} rows={4} disabled={submitMutation.isPending}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); handleSubmit(); } }}
          onPaste={e => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); addFiles(files); } }}
          className="w-full bg-transparent text-white placeholder:text-zinc-500 text-sm leading-relaxed resize-y min-h-24 max-h-80 outline-none disabled:opacity-60" />
        {attachments.length > 0 && <div className="flex gap-2 overflow-x-auto py-2">
          {attachments.map((attachment, index) => <div key={attachment.preview} className="relative shrink-0 w-28">
            <div className="h-20 rounded-lg overflow-hidden border border-white/15 bg-black/20">
              {attachment.file.type.startsWith('video/') ? <video src={attachment.preview} className="w-full h-full object-cover" muted /> : <img src={attachment.preview} alt={attachment.file.name} className="w-full h-full object-cover" />}
            </div>
            <button type="button" disabled={submitMutation.isPending} onClick={() => removeAttachment(index)}
              aria-label={t('features.removePromptAttachment', 'Remove {{name}}', { name: attachment.file.name })}
              data-keep-dark className="absolute right-1 top-1 w-6 h-6 rounded-full bg-black/80 text-white flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            {attachment.file.type.startsWith('image/') && <button type="button" disabled={submitMutation.isPending} onClick={() => setMarkupIndex(index)}
              aria-label={t('editor.draw.heading', 'Draw')}
              data-keep-dark className="absolute left-1 top-1 w-6 h-6 rounded-full bg-black/80 text-white flex items-center justify-center"><Pencil className="w-3.5 h-3.5" /></button>}
            <p className="text-[10px] text-zinc-400 truncate mt-1">{attachment.file.name}</p>
          </div>)}
        </div>}
        <ImageMarkupDialog
          file={markupIndex !== null ? attachments[markupIndex]?.file ?? null : null}
          onClose={() => setMarkupIndex(null)}
          onSave={file => { if (markupIndex !== null) replaceAttachment(markupIndex, file); }}
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 mt-2">
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <Button type="button" variant="ghost" size="sm" className="rounded-lg px-2" disabled={submitMutation.isPending || attachments.length >= MAX_FEATURE_ATTACHMENTS} onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="w-4 h-4" />{t('features.promptAttach', 'Attach images')}
          </Button>
          <span className="hidden sm:inline text-[11px] text-zinc-500">{t('features.promptDrop', 'Paste or drop images here')}</span>
          <Button type="button" variant="glass" className="rounded-xl ml-auto" disabled={!description.trim() || submitMutation.isPending} onClick={handleSubmit}>
            {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('features.promptPost', 'Post prompt')}
          </Button>
        </div>
      </div>
      <div className="flex justify-between gap-3 mt-2 text-[11px] text-zinc-500">
        <span>{description.length}/1000</span><span className="hidden sm:inline">{t('features.promptShortcut', 'Ctrl / ⌘ + Enter to post')}</span>
      </div>
      {error && <p role="alert" className="text-sm text-red-400 mt-2">{error}</p>}
      <details className="mt-2 text-xs text-zinc-400" open={initialCategory === 'bug_fix' ? true : undefined}>
        <summary className="cursor-pointer py-1">{t('features.promptDetails', 'Optional details')}</summary>
        <fieldset disabled={submitMutation.isPending} className="grid gap-3 mt-2">
          <label>{t('features.titleLabel')}<Input className="mt-1" value={title} maxLength={100} onChange={e => setTitle(e.target.value)} /></label>
          <label>{t('features.categoryLabel')}<select value={category} onChange={e => setCategory(e.target.value as FeatureCategory)} className="block w-full rounded-lg bg-zinc-800 border border-white/15 p-2 mt-1 text-white">
            {CATEGORIES.filter(c => c.id !== 'all').map(cat => <option key={cat.id} value={cat.id}>{t(cat.labelKey)}</option>)}
          </select></label>
          <label>{t('features.promptDevice', 'Device & OS (for bugs)')}<Input className="mt-1" value={deviceDetails} maxLength={300} onChange={e => setDeviceDetails(e.target.value)} /></label>
        </fieldset>
      </details>
    </section>
  );
}
function FeatureSkeletons() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div data-skeleton-group key={i} className="bg-zinc-900 rounded-2xl p-4 flex gap-3 animate-pulse">
          <div className="flex flex-col items-center gap-1 min-w-[40px]">
            <div className="w-8 h-8 rounded-lg bg-zinc-800" />
            <div className="w-5 h-4 rounded bg-zinc-800" />
            <div className="w-8 h-8 rounded-lg bg-zinc-800" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-zinc-800" />
            <div className="h-3 w-full rounded bg-zinc-800" />
            <div className="h-3 w-1/2 rounded bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Shipped Feature Card (simpler, no voting)
// ──────────────────────────────────────────────────
function ShippedCard({ feature }: { feature: FeatureRequest }) {
  const { t } = useI18n();
  const { isTranslated: isShippedTranslated, isLoading: isShippedTranslateLoading, error: shippedTranslateError, handleTranslate: handleShippedTranslate, handleShowOriginal: handleShippedShowOriginal } = useSharedTranslationControl();
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3 flex gap-3 cursor-pointer hover:bg-white/[0.05] transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex flex-col items-center justify-center min-w-[40px]">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-white/70" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1.5">
          <TranslatableText publicContent text={feature.title} className="text-white font-semibold text-sm leading-tight flex-1 min-w-0" as="h3" hideControls />
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0 bg-white/10 text-white/70">
            {t('features.shippedBadge')}
          </span>
        </div>

        <TranslatableText publicContent text={feature.description} className={`text-zinc-400 text-xs leading-relaxed mb-2 ${expanded ? '' : 'line-clamp-2'}`} as="p" />

        {/* Translate control */}
        <PostMetadata
          timestamp={feature.updated_at}
          translateControl={{
            isTranslated: isShippedTranslated,
            isLoading: isShippedTranslateLoading,
            error: shippedTranslateError,
            onTranslate: handleShippedTranslate,
            onShowOriginal: handleShippedShowOriginal,
          }}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-lg text-[10px] font-medium">
            {CATEGORY_LABELS[feature.category]}
          </span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Infinite Scroll Sentinel
// ──────────────────────────────────────────────────
function InfiniteScrollSentinel({ onIntersect, isFetching }: { onIntersect: () => void; isFetching: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !isFetching) onIntersect(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect, isFetching]);

  return (
    <div ref={ref} className="flex justify-center py-4">
      {isFetching && <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────
export default function FeaturesPage() {
  const { t: _copy } = _useCopy();
  const { t } = useI18n();
  const { isAuthenticated, openLoginModal } = useAuth();
  const { theme, themeChoice } = useAppTheme();
  const isLightTheme = (theme === 'light' || themeChoice === 'system-light');
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<PageTab>('requests');
  const [sort, setSort] = useState<FeatureSort>('newest');
  const [category, setCategory] = useState<FeatureCategory | 'all'>('all');
  const { layerRef: featuresCatLayerRef, setRef: setFeaturesCatRef, rect: featuresCatRect, onScroll: onFeaturesCatScroll } = useTabIndicator(category);
  const { ref: featuresCatFadeRef, style: featuresCatFadeStyle } = useScrollFadeMask<HTMLDivElement>();
  const { layerRef: featuresSortLayerRef, setRef: setFeaturesSortRef, rect: featuresSortRect, onScroll: onFeaturesSortScroll } = useTabIndicator(sort);
  const [searchInput, setSearchInput] = useSurfaceDraft("src/pages/app/FeaturesPage.tsx:searchInput", '');
  const search = useDebouncedValue(searchInput, 300);
  const [composerFocus, setComposerFocus] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [initialCategory, setInitialCategory] = useState<FeatureCategory | undefined>(undefined);

  // Handle deep-link from "Report a Bug" buttons: open the bug-fix category
  // and pre-populate the submit drawer with the bug_fix category.
  useEffect(() => {
    const report = searchParams.get('report');
    if (report === 'bug') {
      setActiveTab('requests');
      setCategory('bug_fix');
      setInitialCategory('bug_fix');
      setComposerFocus(value => value + 1);
      setSearchParams({}, { replace: true });
      return;
    }

    const requestedTab = searchParams.get('tab');
    if (requestedTab === 'prompts') setActiveTab('requests');
    if (requestedTab === 'queued') setActiveTab('shipping');
    if (requestedTab === 'requests' || requestedTab === 'shipping' || requestedTab === 'shipped') {
      setActiveTab(requestedTab);
    }
  }, [searchParams, setSearchParams]);

  const { data: featuresData, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeatureRequests(sort, category, search);
  const allFeatures = useMemo(() => featuresData?.pages.flat() ?? [], [featuresData]);
  const { data: shippedFeatures, isLoading: isLoadingShipped } = useShippedFeatures();
  const { data: inProgressFeatures, isLoading: isLoadingInProgress } = useInProgressFeatures();

  // A notification about one request pins it above the board. The list query
  // could never be relied on to hold it — it may be shipped, declined, outside
  // the active category, or pages down the infinite scroll — so it is fetched
  // by id and rendered on its own, then removed from whichever list would
  // otherwise show it twice.
  const focusedRequestId = searchParams.get('request');
  const { data: focusedRequest } = useFeatureRequest(focusedRequestId);
  const focusedCommentId = searchParams.get('comment');
  // A comment link implies the thread should be open, whether or not the row
  // that wrote the URL also said so.
  const focusedCommentsOpen = searchParams.get('comments') === '1' || !!focusedCommentId;
  const focusedId = focusedRequest?.id ?? null;
  const withoutFocused = useCallback(
    <T extends { id: string }>(rows: T[] | undefined): T[] =>
      focusedId ? (rows ?? []).filter((row) => row.id !== focusedId) : (rows ?? []),
    [focusedId],
  );
  const features = useMemo(() => withoutFocused(allFeatures), [allFeatures, withoutFocused]);

  // Shipped and Shipping arrive as whole arrays rather than a paged query, so
  // the search box and category chips have to filter them here. Wiring the term
  // into those queries instead would buy nothing -- the rows are already in
  // memory -- and leaving it unwired is why the search box did nothing on
  // every tab but Requests. normalizeRows() has already folded the legacy
  // category aliases, so a plain equality check is enough.
  const matchesFilters = useCallback(
    (row: FeatureRequest) => {
      if (category !== 'all' && row.category !== category) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return row.title.toLowerCase().includes(q) || row.description.toLowerCase().includes(q);
    },
    [category, search],
  );
  const isFiltering = search.trim().length > 0 || category !== 'all';
  const visibleInProgress = useMemo(
    () => withoutFocused(inProgressFeatures).filter(matchesFilters),
    [inProgressFeatures, withoutFocused, matchesFilters],
  );
  const visibleShipped = useMemo(
    () => withoutFocused(shippedFeatures).filter(matchesFilters),
    [shippedFeatures, withoutFocused, matchesFilters],
  );

  // Bring the pinned card into view once it has actually rendered. Scrolling on
  // the id alone would fire before the row exists on a cold load.
  useEffect(() => {
    if (!focusedId) return;
    requestAnimationFrame(() => {
      document.getElementById(`feature-${focusedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [focusedId]);

  useEffect(() => {
    const featureId = searchParams.get('feature');
    if (activeTab !== 'shipped' || !featureId || !shippedFeatures?.some((feature) => feature.id === featureId)) return;

    requestAnimationFrame(() => {
      document.getElementById(`feature-${featureId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [activeTab, searchParams, shippedFeatures]);

  const { data: userVotes } = useUserVotes();
  const voteMutation = useVoteFeatureRequest();

  const handleVote = useCallback(
    (featureId: string, voteType: 1 | -1, currentVote: number | undefined) => {
      if (!isAuthenticated) {
        openLoginModal();
        return;
      }
      voteMutation.mutate({ featureRequestId: featureId, voteType, currentVote });
    },
    [isAuthenticated, openLoginModal, voteMutation]
  );

  const handleSubmitClick = () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setActiveTab('requests');
    setComposerFocus(value => value + 1);
  };

  // `open` is counted server-side with the same status filter the list uses, so
  // the tab badge always matches the rows below it.
  const { data: counts } = useFeatureCounts();

  const remainingCount = counts?.open ?? features.length;
  const shippedCount = shippedFeatures?.length ?? 0;
  const inProgressCount = inProgressFeatures?.length ?? 0;


  // Swallow the feature-request list at the sticky header bento's top edge under
  // the glass themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]', [], { allThemes: true });

  return (
    <div data-requests-page className="min-h-screen">
      <SEOHead title={_copy("copy.5d2d9bc248a3", { defaultValue: "Feature Requests & Bug Reporting — DeHub" })} description={_copy("copy.2c94a53da07c", { defaultValue: "Submit feature requests, report bugs, and vote on community ideas to shape DeHub's roadmap. Track open, in-progress, and shipped features." })} url="https://dehub.io/app/features" jsonLd={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'DeHub Feature Requests & Bug Reporting', url: 'https://dehub.io/app/features', description: _copy("copy.d2c76d7df46f", { defaultValue: "Submit feature requests, report bugs, and vote on community ideas to shape DeHub's roadmap." }), isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' } }} />
      <h1 className="sr-only">{_copy("copy.64ce9ca9f7d1", { defaultValue: "DeHub Features — Feature Requests, Bug Reporting & Community Roadmap" })}</h1>
      {/* Sticky nav pill. `data-feed-nav-outer` already rides the scroll on
          mobile; `data-nav-hide-desktop` opts this one into the same thing on
          desktop too. Because this header is a full bento — title, search,
          three tabs, category pills and sort tabs — `data-nav-return-top`
          keeps it hidden until the page reaches the top instead of covering a
          request after any small upward correction. */}
      <div data-feed-nav-outer data-nav-hide-desktop data-nav-return-top className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2">
        <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BrandIcon src={featuresLightbulb} alt={_copy("copy.5697d03daef4", { defaultValue: "Features" })} className="w-12 h-12 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-white">{t('features.promptPageTitle', 'Requests')}</h1>
              <p className="text-zinc-500 text-sm">{t('features.promptSubtitle', 'Build DeHub with a prompt')}</p>
            </div>
          </div>
          <Button
            onClick={handleSubmitClick}
            aria-label={t('features.promptNew', 'New prompt')}
            variant="glass"
            className="rounded-xl font-semibold text-sm"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('features.promptNew', 'New prompt')}</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder={t('features.promptSearch', 'Search prompts…')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>

        {/* Page Tabs: Requests / Shipping / Shipped */}
        <div role="tablist" aria-label={t('features.promptPageTitle', 'Requests')} className="relative flex gap-1 bg-zinc-800/40 rounded-xl p-1 mb-3">
          {/* Sliding liquid glass indicator */}
          <div
            className={cn(
              "absolute top-1 bottom-1 w-[calc(33.333%-4px)] rounded-lg bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 transition-transform duration-300 ease-out",
              isLightTheme
                ? "shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2)]"
                : "shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4)]",
              activeTab === 'shipped'
                ? 'translate-x-[calc(200%+8px)]'
                : activeTab === 'shipping'
                  ? 'translate-x-[calc(100%+4px)]'
                  : 'translate-x-0'
            )}
          />
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            role="tab" aria-selected={activeTab === 'requests'}
            className={`relative z-10 flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-300 flex items-center justify-center gap-1.5 ${
              activeTab === 'requests' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t('features.prompts', 'Prompts')}
            {remainingCount > 0 && (
              <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded-md font-semibold">
                {remainingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shipping')}
            role="tab" aria-selected={activeTab === 'shipping'}
            className={`relative z-10 flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-300 flex items-center justify-center gap-1.5 ${
              activeTab === 'shipping' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Loader2 className="w-3.5 h-3.5" />
            {t('features.queued', 'Queued')}
            {inProgressCount > 0 && (
              <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded-md font-semibold">
                {inProgressCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shipped')}
            role="tab" aria-selected={activeTab === 'shipped'}
            className={`relative z-10 flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-300 flex items-center justify-center gap-1.5 ${
              activeTab === 'shipped' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('features.shipped')}
            {shippedCount > 0 && (
              <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded-md font-semibold">
                {shippedCount}
              </span>
            )}
          </button>
        </div>


        {/* Category chips filter every tab. Shipped holds most of the board, so
            hiding them there left ~136 rows with no way to narrow them at all.
            Sort stays Requests-only: Shipping and Shipped are ordered by ship
            date, which is the order people expect on a changelog. */}
        <>
            <Button variant="ghost" size="sm" className="mb-2 rounded-lg" aria-expanded={showFilters} onClick={() => setShowFilters(value => !value)}>
              {t('features.promptFilters', 'Filter by category')}{category !== 'all' && ` · ${CATEGORY_LABELS[category]}`}
            </Button>
            {showFilters && <>
            {/* Category Pills */}
            <div className="relative mb-3">
              <div ref={featuresCatLayerRef} className="relative" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
                <GlassIndicator rect={featuresCatRect} borderRadius="0.5rem" />
                <div
                  ref={featuresCatFadeRef}
                  className="relative z-20 flex gap-2 overflow-x-auto scrollbar-invisible pb-1"
                  style={featuresCatFadeStyle}
                  onScroll={onFeaturesCatScroll}
                >
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      ref={setFeaturesCatRef(cat.id)}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`relative z-40 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
                        category === cat.id
                          ? 'text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span className="relative z-10">{t(cat.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            </>}
            {/* Sort Tabs */}
            {activeTab === 'requests' && (
            <div ref={featuresSortLayerRef} className="relative" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
              <GlassIndicator rect={featuresSortRect} borderRadius="0.5rem" />
              <div className="relative z-20 flex gap-1.5 overflow-x-auto scrollbar-invisible" onScroll={onFeaturesSortScroll}>
                {SORTS.map((s) => {
                  const isActive = sort === s.id;
                  return (
                    <button
                      key={s.id}
                      ref={setFeaturesSortRef(s.id)}
                      type="button"
                      onClick={() => setSort(s.id)}
                      className={`relative z-40 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                        isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <span className="relative z-10">{t(s.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            )}
        </>
        </div>
      </div>

      {/* Content */}
      <div data-feed-swallow-bounds>
<div ref={contentRef} className="px-2 sm:px-3 pt-2 pb-3">
<FeedSwallowMotion>
      <div hidden={activeTab !== 'requests'}>
        <PromptComposer initialCategory={initialCategory} focusRequest={composerFocus} onPosted={() => { setCategory('all'); setSearchInput(''); setSort('newest'); }} />
      </div>
      {/* The request a notification pointed at, above whichever tab is open. */}
      {focusedRequest && (
        <div className="mb-3">
          <SharedTranslationProvider key={focusedRequest.id}>
            <FeatureCard
              feature={focusedRequest}
              currentVote={userVotes?.[focusedRequest.id]}
              onVote={handleVote}
              voteDisabled={voteMutation.isPending}
              defaultCommentsOpen={focusedCommentsOpen}
              focusCommentId={focusedCommentId}
            />
          </SharedTranslationProvider>
        </div>
      )}
      {/* Feature List (Requests Tab) */}
      {activeTab === 'requests' && (
        <>
          {isLoading ? (
            <FeatureSkeletons />
          ) : isError ? (
            <div data-page-bento className="bg-zinc-900 rounded-2xl p-8 text-center">
              <h3 className="text-white font-semibold mb-1">{t('features.loadFailed', "Couldn't load requests")}</h3>
              <Button
                onClick={() => refetch()}
                variant="glass"
                className="rounded-xl font-semibold mt-3"
              >
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          ) : features.length > 0 ? (
            <div className="space-y-3">
              {features.map((feature) => (
                <SharedTranslationProvider key={feature.id}>
                  <FeatureCard
                    feature={feature}
                    currentVote={userVotes?.[feature.id]}
                    onVote={handleVote}
                    voteDisabled={voteMutation.isPending}
                  />
                </SharedTranslationProvider>
              ))}
              {/* Infinite scroll sentinel */}
              {hasNextPage && (
                <InfiniteScrollSentinel
                  onIntersect={fetchNextPage}
                  isFetching={isFetchingNextPage}
                />
              )}
            </div>
          ) : (
            <div data-page-bento className="bg-zinc-900 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <BrandIcon src={featuresLightbulb} alt={_copy("copy.c46c50e9cf58", { defaultValue: "No features yet" })} className="w-16 h-16 object-contain opacity-40" />
              </div>
              <h3 className="text-white font-semibold mb-1">{t('features.noRequestsYet')}</h3>
              <p className="text-zinc-500 text-sm mb-4">{t('features.beFirstIdea')}</p>
              <Button
                onClick={handleSubmitClick}
                variant="glass"
                className="rounded-xl font-semibold"
              >
                <Plus className="w-4 h-4" />
                {t('features.submitFeatureRequest')}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Shipping (In Progress) Tab */}
      {activeTab === 'shipping' && (
        <>
          {isLoadingInProgress ? (
            <FeatureSkeletons />
          ) : visibleInProgress.length > 0 ? (
            <div className="space-y-3">
              {visibleInProgress.map((feature) => (
                <SharedTranslationProvider key={feature.id}>
                  <FeatureCard
                    feature={feature}
                    currentVote={userVotes?.[feature.id]}
                    onVote={handleVote}
                    voteDisabled={voteMutation.isPending}
                  />
                </SharedTranslationProvider>
              ))}
            </div>
          ) : (
            <div data-page-bento className="bg-zinc-900 rounded-2xl p-8 text-center">
              <ThemedIcon icon="features" alt="" className="w-16 h-16 object-contain mx-auto mb-4 opacity-65" />
              <h3 className="text-white font-semibold mb-1">
                {isFiltering
                  ? (search.trim() ? t('follow.noMatches', { query: search.trim() }) : t('filters.noMatches'))
                  : t('features.noShippingYet', 'Nothing in progress')}
              </h3>
              {!isFiltering && <p className="text-zinc-500 text-sm">{t('features.shippingAppearHere', 'Requests being built will appear here.')}</p>}
            </div>
          )}
        </>
      )}


      {/* Shipped Features Tab */}
      {activeTab === 'shipped' && (
        <>
          {isLoadingShipped ? (
            <FeatureSkeletons />
          ) : visibleShipped.length > 0 ? (
            <div className="space-y-3">
              {visibleShipped.map((feature) => (
                <SharedTranslationProvider key={feature.id}>
                  <FeatureCard
                    feature={feature}
                    currentVote={userVotes?.[feature.id]}
                    onVote={handleVote}
                    voteDisabled={voteMutation.isPending}
                  />
                </SharedTranslationProvider>
              ))}
            </div>
          ) : (
            <div data-page-bento className="bg-zinc-900 rounded-2xl p-8 text-center">
              <ThemedIcon icon="features" alt="" className="w-16 h-16 object-contain mx-auto mb-4 opacity-65" />
              <h3 className="text-white font-semibold mb-1">
                {isFiltering
                  ? (search.trim() ? t('follow.noMatches', { query: search.trim() }) : t('filters.noMatches'))
                  : t('features.noShippedYet')}
              </h3>
              {!isFiltering && <p className="text-zinc-500 text-sm">{t('features.shippedAppearHere')}</p>}
            </div>
          )}
        </>
      )}
      </FeedSwallowMotion>
</div>
</div>


    </div>
  );
}
