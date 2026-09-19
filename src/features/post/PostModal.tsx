import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { usePostForm } from './hooks/usePostForm';
import { usePostSound } from './hooks/usePostSound';
import type { PollData, LiveStreamHandoff } from './types';
import { PostContentArea } from './components/PostContentArea';
import { PostAccessToggles } from './components/PostAccessToggles';
import { PostActionBar } from './components/PostActionBar';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { SoundPicker } from './components/SoundPicker';
import { cn } from '@/lib/utils';
import { DEHUB_CDN_BASE } from '@/lib/api/dehub';
import { useKeyboardSafeSheet } from '@/hooks/use-keyboard-open';
import { BannedAccountNotice } from '@/components/app/BannedAccountNotice';
import { useBannedAccount } from '@/hooks/use-banned-account';

const CreatePlanModal = lazy(() =>
  import('@/components/app/subscriptions/CreatePlanModal').then((module) => ({
    default: module.CreatePlanModal,
  })),
);

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles?: FileList | null;
  onFilesProcessed?: () => void;
  initialText?: string;
  initialCategory?: string;
  initialPoll?: PollData | null;
}

export function PostModal({ isOpen, onClose, initialFiles, onFilesProcessed, initialText, initialCategory, initialPoll }: PostModalProps) {
  const { style: keyboardStyle } = useKeyboardSafeSheet(isOpen);
  const { isBanned } = useBannedAccount();
  // Where a live post goes once its mint has provisioned the stream. Held here
  // rather than in the action bar so it survives the bar's own re-renders, and
  // cleared on close so reopening the composer never reopens a dead broadcast.
  const [liveStream, setLiveStream] = useState<LiveStreamHandoff | null>(null);
  const { state, actions, computed, refs } = usePostForm(onClose, setLiveStream);
  const { attachedSound, selectSound, clearSound } = usePostSound();
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [mediaFullscreenOpen, setMediaFullscreenOpen] = useState(false);
  const [articleMode, setArticleMode] = useState(false);
  const [articleBody, setArticleBody] = useState('');
  const [articleImage, setArticleImage] = useState<File | null>(null);
  const [articleImagePreview, setArticleImagePreview] = useState('');
  const articleEditorRef = useRef<HTMLTextAreaElement>(null);
  const [articlePreview, setArticlePreview] = useState(false);
  const formatArticle = (before: string, after = '', placeholder = 'text', block = false) => {
    const editor = articleEditorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = articleBody.slice(start, end) || placeholder;
    const prefix = block && start > 0 && articleBody[start - 1] !== '\n' ? '\n' : '';
    const next = `${articleBody.slice(0, start)}${prefix}${before}${selected}${after}${articleBody.slice(end)}`.slice(0, 20000);
    setArticleBody(next);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + prefix.length + before.length, start + prefix.length + before.length + selected.length);
    });
  };
  const draftImageData = async (file: File | null): Promise<string | undefined> => {
    if (!file) return undefined;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / bitmap.width, 1200 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.78);
  };
  const restoreDraftImage = async (data: string | undefined, name: string, setter: (file: File | null) => void) => {
    if (!data?.startsWith('data:image/jpeg;base64,')) { setter(null); return; }
    const blob = await (await fetch(data)).blob();
    setter(new File([blob], name, { type: 'image/jpeg' }));
  };

  useEffect(() => {
    if (!articleImage) { setArticleImagePreview(''); return; }
    const url = URL.createObjectURL(articleImage);
    setArticleImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [articleImage]);

  const handleTogglePoll = useCallback(() => {
    if (state.poll) {
      actions.setPoll(null);
    } else {
      actions.setPoll({
        question: '',
        options: [
          { id: '1', text: '' },
          { id: '2', text: '' },
        ],
        duration: 24,
        isMultipleChoice: false,
      });
    }
  }, [state.poll, actions.setPoll]);


  // When opening from share (initialText provided), reset form first for a fresh start
  useEffect(() => {
    if (isOpen && initialText) {
      actions.resetForm();
      // Small delay to let reset take effect, then set the text
      setTimeout(() => {
        actions.setText(initialText);
      }, 0);
    }
  }, [isOpen, initialText]);

  // Set initial category when modal opens
  useEffect(() => {
    if (isOpen && initialCategory) {
      actions.setSelectedCategory(initialCategory);
    }
  }, [isOpen, initialCategory]);

  // Pre-initialize poll when opened with initialPoll
  useEffect(() => {
    if (isOpen && initialPoll) {
      actions.setPoll(initialPoll);
    }
  }, [isOpen, initialPoll]);

  // Process initial files when modal opens with pending files
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      actions.handleFileDrop(initialFiles);
      onFilesProcessed?.();
    }
  }, [isOpen, initialFiles, actions.handleFileDrop, onFilesProcessed]);

  const handleClose = () => {
    // A finished broadcast must not be able to reopen itself the next time the
    // composer is opened.
    setLiveStream(null);
    setPlanDrawerOpen(false);
    setArticleMode(false);
    setArticleBody('');
    setArticleImage(null);
    onClose();
  };

  const selectPostMode = () => {
    setArticleMode(false);
    actions.setLiveMode(null);
    actions.setShowTitle(false);
  };

  const selectLiveMode = (mode: 'video' | 'townhall') => {
    setArticleMode(false);
    actions.setLiveMode(mode);
  };

  const selectArticleMode = () => {
    setArticleMode(true);
    actions.setShowTitle(true);
    actions.setLiveMode(null);
    actions.setIsPPV(false);
    actions.setIsTokenGated(false);
    actions.setIsSubscribersOnly(false);
  };

  // A banned account can read every post on DeHub and write none of them.
  // The API refuses the mint either way; showing the composer first would
  // only mean losing whatever was typed into it.
  const modalContent = isBanned ? (
    <div className="px-4 py-8">
      <BannedAccountNotice />
    </div>
  ) : (
    <>
      <div className="flex items-center justify-center gap-3 px-4 pt-4 pb-1 text-xs font-medium">
        <button type="button" aria-pressed={!articleMode && state.liveMode === null} onClick={selectPostMode} className={cn('transition-colors', !articleMode && state.liveMode === null ? 'text-white' : 'text-white/55 hover:text-white')}>Post</button>
        <span className="text-white/25" aria-hidden="true">|</span>
        <button type="button" aria-pressed={state.liveMode === 'video'} onClick={() => selectLiveMode('video')} className={cn('transition-colors', state.liveMode === 'video' ? 'text-white' : 'text-white/55 hover:text-white')}>Livestream</button>
        <span className="text-white/25" aria-hidden="true">|</span>
        <button type="button" aria-pressed={state.liveMode === 'townhall'} onClick={() => selectLiveMode('townhall')} className={cn('transition-colors', state.liveMode === 'townhall' ? 'text-white' : 'text-white/55 hover:text-white')}>Stages</button>
        <span className="text-white/25" aria-hidden="true">|</span>
        <button type="button" aria-pressed={articleMode} onClick={selectArticleMode} className={cn('transition-colors', articleMode ? 'text-white' : 'text-white/55 hover:text-white')}>Article</button>
      </div>

      <PostContentArea
        text={state.text}
        setText={actions.setText}
        editorRef={refs.editorRef}
        media={state.media}
        onRemoveMedia={actions.removeMedia}
        onMoveMedia={actions.moveMedia}
        onAddAudio={actions.addAudioToMedia}
        onRemoveAudio={actions.removeAudioFromMedia}
        onToggleMusicVideo={actions.toggleMusicVideo}
        onAddThumbnail={actions.addThumbnailToMedia}
        onRemoveThumbnail={actions.removeThumbnailFromMedia}
        onApplyFilter={actions.applyFilterToMedia}
        onClearFilter={actions.clearFilterFromMedia}
        onApplyCrop={actions.applyCropToMedia}
        onClearCrop={actions.clearCropFromMedia}
        onApplyTrim={actions.applyTrimToMedia}
        onReplaceImage={actions.replaceImageFile}
        liveMode={state.liveMode}
        canPost={computed.canPost}
        destinations={computed.destinations}
        hasVideo={computed.hasVideo}
        hasImage={computed.hasImage}
        hasAudio={computed.hasAudio}
        onFileDrop={actions.handleFileDrop}
        scheduledDate={state.scheduledDate}
        onSchedule={actions.setScheduledDate}
        drafts={state.drafts}
        onSaveDraft={() => {
          if (!articleMode) { actions.saveDraft(); return; }
          draftImageData(articleImage)
            .then(imageData => actions.saveDraft({ body: articleBody, title: state.titleText, imageData, socialData: imageData }))
            .catch(() => actions.saveDraft({ body: articleBody, title: state.titleText }));
        }}
        onLoadDraft={draft => {
          actions.loadDraft(draft);
          if (draft.articleBody) {
            setArticleMode(true);
            setArticleBody(draft.articleBody);
            actions.setTitleText(draft.articleTitle || '');
            actions.setShowTitle(true);
            void restoreDraftImage(draft.socialImageData || draft.articleImageData, 'article-share-image.jpg', setArticleImage);
          }
        }}
        onDeleteDraft={actions.deleteDraft}
        canSaveDraft={computed.hasContent}
        isRecording={state.isRecording}
        recordingTime={state.recordingTime}
        onStopRecording={actions.stopRecording}
        chainId={state.chainId}
        onChainChange={actions.setChainId}
        showTitle={state.showTitle}
        titleText={state.titleText}
        setTitleText={actions.setTitleText}
        onOpenCategories={() => setCategoryDrawerOpen(true)}
        poll={state.poll}
        onPollChange={actions.setPoll}
        onMediaFullscreenChange={setMediaFullscreenOpen}
      />
      {articleMode && (
        <div className="px-4 pb-4 space-y-2">
          <div className="space-y-2 pb-2">
            <label className="block text-sm text-white/80">Social share image</label>
            <label className="block cursor-pointer overflow-hidden rounded-xl border border-white/20 bg-white/5 transition-colors hover:border-white/40">
              {articleImagePreview ? (
                <div>
                  <img src={articleImagePreview} alt="Social share preview" className="aspect-[1.91/1] w-full object-cover" />
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-1 text-sm font-semibold text-white">{state.titleText.trim() || 'Your article title'}</p>
                    <p className="line-clamp-2 text-xs text-white/60">{state.text.trim() || 'Your article summary will appear here when this is shared.'}</p>
                  </div>
                </div>
              ) : (
                <div className="flex aspect-[1.91/1] items-center justify-center px-4 text-center text-xs text-white/60">
                  Add the image shown at the top of your article and in social previews
                </div>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => setArticleImage(e.target.files?.[0] || null)} />
            </label>
            {articleImage && <button type="button" className="text-xs text-white/60 underline" onClick={() => setArticleImage(null)}>Remove image</button>}
          </div>
          <label htmlFor="article-body" className="block text-sm text-white/80">Article body</label>
          <div className="flex flex-wrap items-center gap-1 text-xs" aria-label="Article formatting">
            {([
              ['Large', '# ', '', 'Heading', true], ['Heading', '## ', '', 'Heading', true],
              ['Bold', '**', '**', 'bold text', false], ['Italic', '*', '*', 'italic text', false],
              ['Quote', '> ', '', 'Quote', true], ['Bullets', '- ', '', 'List item', true],
              ['Numbers', '1. ', '', 'List item', true], ['Link', '[', '](https://example.com)', 'link text', false],
            ] as const).map(([label, before, after, placeholder, block]) => (
              <button key={label} type="button" onClick={() => formatArticle(before, after, placeholder, block)} className="rounded-md px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white">{label}</button>
            ))}
            <button type="button" aria-pressed={articlePreview} onClick={() => setArticlePreview(!articlePreview)} className="ml-auto rounded-md px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white">{articlePreview ? 'Edit' : 'Preview'}</button>
          </div>
          {articlePreview ? <div className="prose prose-invert min-h-64 max-w-none rounded-xl border border-white/20 bg-white/5 p-4 text-white"><ReactMarkdown>{articleBody}</ReactMarkdown></div> : <textarea ref={articleEditorRef} id="article-body" value={articleBody} onChange={e => setArticleBody(e.target.value.slice(0, 20000))}
            placeholder="Write your article here. Use blank lines between paragraphs."
            className="w-full min-h-64 rounded-xl border border-white/20 bg-white/5 p-4 text-white outline-none focus:border-white/50" />}
          <p className="text-xs text-white/60">{articleBody.length}/20,000 · minimum 100 characters. The post text above is the summary.</p>
        </div>
      )}

      {!articleMode && <PostAccessToggles
        isSubscribersOnly={state.isSubscribersOnly}
        setIsSubscribersOnly={actions.setIsSubscribersOnly}
        isPPV={state.isPPV}
        setIsPPV={actions.setIsPPV}
        ppvAmount={state.ppvAmount}
        setPpvAmount={actions.setPpvAmount}
        ppvCurrency={state.ppvCurrency}
        setPpvCurrency={actions.setPpvCurrency}
        isWatch2Earn={state.isWatch2Earn}
        setIsWatch2Earn={actions.setIsWatch2Earn}
        w2eViews={state.w2eViews}
        setW2eViews={actions.setW2eViews}
        w2eComments={state.w2eComments}
        setW2eComments={actions.setW2eComments}
        w2eTotal={state.w2eTotal}
        setW2eTotal={actions.setW2eTotal}
        w2eCurrency={state.w2eCurrency}
        setW2eCurrency={actions.setW2eCurrency}
        isTokenGated={state.isTokenGated}
        setIsTokenGated={actions.setIsTokenGated}
        tokenContract={state.tokenContract}
        setTokenContract={actions.setTokenContract}
        tokenSymbol={state.tokenSymbol}
        setTokenSymbol={actions.setTokenSymbol}
        tokenAmount={state.tokenAmount}
        setTokenAmount={actions.setTokenAmount}
        postChainId={state.chainId}
        selectedCategory={state.selectedCategory}
        setSelectedCategory={actions.setSelectedCategory}
        markCategorySaved={actions.markCategorySaved}
        showTitle={state.showTitle}
        setShowTitle={actions.setShowTitle}
        isMature={state.isMature}
        setIsMature={actions.setIsMature}
        isForKids={state.isForKids}
        setIsForKids={actions.setIsForKids}
        shopLinks={state.shopLinks}
        setShopLinks={actions.setShopLinks}
        shopListingIds={state.shopListingIds}
        setShopListingIds={actions.setShopListingIds}
        hasVideoOrAudio={computed.hasVideo || computed.hasAudio}
        categoryDrawerOpen={categoryDrawerOpen}
        setCategoryDrawerOpen={setCategoryDrawerOpen}
        shouldMint={state.shouldMint}
        setShouldMint={actions.setShouldMint}
        mintFeeLabel={computed.mintFeeLabel}
        mintRequired={computed.mintRequired}
        onCreatePlan={() => setPlanDrawerOpen(true)}
      />}

      <PostActionBar
        imageInputRef={refs.imageInputRef}
        videoInputRef={refs.videoInputRef}
        audioInputRef={refs.audioInputRef}
        onImageSelect={actions.handleImageSelect}
        onVideoSelect={actions.handleVideoSelect}
        onAudioSelect={actions.handleAudioSelect}
        onStartRecording={actions.startRecording}
        liveMode={state.liveMode}
        liveStream={liveStream}
        setLiveMode={actions.setLiveMode}
        onInsertFormatting={actions.insertFormatting}
        onInsertEmoji={actions.insertEmoji}
        onInsertGif={actions.insertGif}
        onCameraCapture={actions.openCameraCapture}
        onEnhanceWithAI={actions.handleEnhanceWithAI}
        onPost={() => {
          const soundtrackTag = attachedSound
            ? (() => {
                const relPath = attachedSound.url.startsWith(DEHUB_CDN_BASE)
                  ? attachedSound.url.slice(DEHUB_CDN_BASE.length)
                  : attachedSound.url;
                return `[soundtrack:${attachedSound.tokenId}:${attachedSound.title}:${attachedSound.creator}:${relPath}]`;
              })()
            : undefined;
          actions.handlePost({ ...(soundtrackTag ? { soundtrackTag } : {}), ...(articleMode ? { articleBody: articleBody.trim(), articleImage: articleImage || undefined, socialImage: articleImage || undefined } : {}) });
        }}
        canPost={computed.canPost && (!articleMode || (state.titleText.trim().length > 0 && state.text.trim().length > 0 && articleBody.trim().length >= 100 && !computed.hasVideo && !computed.hasImage && !computed.hasAudio))}
        isEnhancing={state.isEnhancing}
        isPosting={state.isPosting}
        uploadProgress={state.uploadProgress}
        mintAwaitingWallet={state.mintAwaitingWallet}
        onAbandonMint={actions.abandonMint}
        
        hasText={!!state.text.trim()}
        hasImage={computed.hasImage}
        hasVideo={computed.hasVideo}
        isScheduled={!!state.scheduledDate}
        onOpenCategories={() => setCategoryDrawerOpen(true)}
        onOpenSoundPicker={() => setSoundPickerOpen(true)}
        attachedSound={attachedSound}
        onClearSound={clearSound}
        onCloseModal={handleClose}
        onTogglePoll={handleTogglePoll}
        hasPoll={!!state.poll}
      />
    </>
  );

  // Prevent drawer from closing when camera is open
  const handleDrawerChange = (open: boolean) => {
    if (!open && (state.isCameraModalOpen || mediaFullscreenOpen)) return;
    if (!open) handleClose();
  };

  // Use Drawer/Sheet on ALL devices (mobile, tablet, desktop)
  return (
    <>
      <Drawer
        open={isOpen}
        onOpenChange={handleDrawerChange}
        repositionInputs={false}
        dismissible={!mediaFullscreenOpen}
      >
        <DrawerContent
          glass
          hideHandle
          data-post-modal
          style={keyboardStyle ?? undefined}
          // The composer opens over the feed it posts into, so on desktop it
          // takes that column rather than the whole viewport — see `column` in
          // ui/drawer.
          column
          className={cn(
            "max-h-[90dvh]",
            state.isCameraModalOpen && "invisible pointer-events-none"
          )}
        >
          <VisuallyHidden>
            <DrawerTitle>Create a post</DrawerTitle>
          </VisuallyHidden>
          {modalContent}
        </DrawerContent>
      </Drawer>

      <CameraCaptureModal
        isOpen={state.isCameraModalOpen}
        onClose={actions.closeCameraCapture}
        onVideoRecorded={actions.handleCameraVideoRecorded}
        onPhotoCaptured={actions.handleCameraPhotoCaptured}
      />

      <SoundPicker
        isOpen={soundPickerOpen}
        onClose={() => setSoundPickerOpen(false)}
        onSelect={selectSound}
        currentSound={attachedSound}
      />

      {planDrawerOpen && (
        <Suspense fallback={null}>
          <CreatePlanModal
            open={planDrawerOpen}
            onOpenChange={setPlanDrawerOpen}
            onCreated={() => actions.setIsSubscribersOnly(true)}
          />
        </Suspense>
      )}
    </>
  );
}
