import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Report Modal Component
 * ======================
 * Drawer for reporting content violations.
 * Uses the v2 Reports API with dynamic reasons from backend.
 */

import { useState, useEffect } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import {
  reportContent,
  reportUser,
  reportComment,
  getContentReportReasons,
  getUserReportReasons,
  getCommentReportReasons,
  type ReportReason,
} from '@/lib/api/dehub';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

/**
 * Fallback reasons if the reasons API call fails. The ids must come from the
 * server's enum — a report with an id outside it is rejected as invalid, so a
 * made-up fallback id turns the whole modal into a dead end exactly when the
 * reasons fetch already failed.
 */
const FALLBACK_CONTENT_REASONS: ReportReason[] = [
  { id: 'spam_misleading', get label() { return _translateCopy("copy.97ab5d0657d3", { defaultValue: "Spam or misleading" }); } },
  { id: 'harassment_bullying', get label() { return _translateCopy("copy.56dc2b3bb2e5", { defaultValue: "Harassment or bullying" }); } },
  { id: 'violent_content', get label() { return _translateCopy("copy.4dfa57a4c648", { defaultValue: "Violence or dangerous content" }); } },
  { id: 'sexual_content', get label() { return _translateCopy("copy.e4610c9847a3", { defaultValue: "Explicit sexual content" }); } },
  { id: 'infringes_rights', get label() { return _translateCopy("copy.052ec74b513d", { defaultValue: "Infringes my rights" }); } },
  { id: 'scam_fraud', get label() { return _translateCopy("copy.5f0f908b54ed", { defaultValue: "Scam or fraud" }); } },
  { id: 'other', get label() { return _translateCopy("copy.f97e9da0e3b8", { defaultValue: "Other" }); } },
];

const FALLBACK_USER_REASONS: ReportReason[] = [
  { id: 'spam', get label() { return _translateCopy("copy.7cf990f7ab34", { defaultValue: "Spam account" }); } },
  { id: 'harassment_bullying', get label() { return _translateCopy("copy.56dc2b3bb2e5", { defaultValue: "Harassment or bullying" }); } },
  { id: 'impersonation', get label() { return _translateCopy("copy.059551570001", { defaultValue: "Impersonation" }); } },
  { id: 'scam_fraud', get label() { return _translateCopy("copy.5f0f908b54ed", { defaultValue: "Scam or fraud" }); } },
  { id: 'other', get label() { return _translateCopy("copy.f97e9da0e3b8", { defaultValue: "Other" }); } },
];

const FALLBACK_COMMENT_REASONS: ReportReason[] = [
  { id: 'spam', get label() { return _translateCopy("copy.94a9eac404c8", { defaultValue: "Spam" }); } },
  { id: 'harassment', get label() { return _translateCopy("copy.98a7655d026a", { defaultValue: "Harassment" }); } },
  { id: 'hate_speech', get label() { return _translateCopy("copy.5b1a77cb0894", { defaultValue: "Hate speech" }); } },
  { id: 'sexual_content', get label() { return _translateCopy("copy.cedfe045ae82", { defaultValue: "Sexual content" }); } },
  { id: 'violence', get label() { return _translateCopy("copy.16d186a18037", { defaultValue: "Violence" }); } },
  { id: 'scam_or_fraud', get label() { return _translateCopy("copy.5f0f908b54ed", { defaultValue: "Scam or fraud" }); } },
  { id: 'misinformation', get label() { return _translateCopy("copy.34d52e35bd31", { defaultValue: "Misinformation" }); } },
  { id: 'other', get label() { return _translateCopy("copy.f97e9da0e3b8", { defaultValue: "Other" }); } },
];

type ReportType = 'content' | 'user' | 'comment';

const fallbackReasonsFor = (reportType: ReportType) =>
  reportType === 'user'
    ? FALLBACK_USER_REASONS
    : reportType === 'comment'
      ? FALLBACK_COMMENT_REASONS
      : FALLBACK_CONTENT_REASONS;

const fetchReasonsFor = (reportType: ReportType) =>
  reportType === 'user'
    ? getUserReportReasons()
    : reportType === 'comment'
      ? getCommentReportReasons()
      : getContentReportReasons();

interface ReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Token ID for content reports */
  tokenId?: number | string;
  /** User ID/address for user reports */
  userId?: string;
  /** Comment id for comment reports */
  commentId?: number | string;
  /** Whether this is a content, user or comment report */
  reportType?: ReportType;
  contentType?: 'post' | 'video' | 'image' | 'audio';
}

export function ReportModal({
  open,
  onOpenChange,
  tokenId,
  userId,
  commentId,
  reportType = 'content',
  contentType = 'post',
}: ReportModalProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [description, setDescription] = useSurfaceDraft("components/app/modals/ReportModalContent.tsx:description", '', JSON.stringify([reportType, tokenId, userId, commentId]));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [isLoadingReasons, setIsLoadingReasons] = useState(false);

  // Fetch reasons from API when modal opens
  useEffect(() => {
    if (!open) return;

    const fetchReasons = async () => {
      setIsLoadingReasons(true);
      try {
        const result = await fetchReasonsFor(reportType);
        setReasons(result.length > 0 ? result : fallbackReasonsFor(reportType));
      } catch {
        setReasons(fallbackReasonsFor(reportType));
      } finally {
        setIsLoadingReasons(false);
      }
    };

    fetchReasons();
  }, [open, reportType]);

  const handleSubmit = async () => {
    if (!selectedReason) {
      toast.error(_copy("copy.00219dda7288", { defaultValue: "Please select a reason for your report" }));
      return;
    }

    if (!isAuthenticated) {
      toast.error(_copy("copy.e3ec84bb95b2", { defaultValue: "You must be logged in to submit a report" }));
      return;
    }

    setIsSubmitting(true);
    try {
      if (reportType === 'user' && userId) {
        await reportUser({
          userId,
          reason: selectedReason,
          description: description.trim() || undefined,
        });
      } else if (reportType === 'comment') {
        if (commentId === undefined || commentId === null || commentId === '') {
          toast.error(_copy("copy.042678ea40b5", { defaultValue: "Invalid comment ID" }));
          return;
        }
        await reportComment({
          commentId,
          reason: selectedReason,
          description: description.trim() || undefined,
        });
      } else if (tokenId !== undefined) {
        const numericTokenId = typeof tokenId === 'string' ? parseInt(tokenId, 10) : tokenId;
        if (isNaN(numericTokenId)) {
          toast.error(_copy("copy.09d6f75f62fe", { defaultValue: "Invalid content ID" }));
          return;
        }
        await reportContent({
          tokenId: numericTokenId,
          reason: selectedReason,
          description: description.trim() || undefined,
        });
      }

      toast.success(t('toasts.reported_for_moderation'));
      handleClose();
    } catch (error: any) {
      console.error('[ReportModal] Submit error:', error);
      if (error.message?.includes('already reported')) {
        toast.error(reportType === 'comment' ? t('comments.reportCommentAlready') : 'You have already reported this');
      } else if (error.message?.includes('Unauthorized')) {
        toast.error(_copy("copy.c5934c28976f", { defaultValue: "Please log in to submit a report" }));
      } else {
        toast.error(error.message || 'Failed to submit report');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedReason('');
    setDescription.complete(description, '');
    onOpenChange(false);
  };

  const title = reportType === 'user'
    ? 'Report User'
    : reportType === 'comment'
      ? t('comments.reportCommentTitle')
      : `Report ${contentType}`;
  const subtitle = reportType === 'comment'
    ? t('comments.reportCommentDescription')
    : "Help us understand what's wrong";

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent column glass className="max-h-[90dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Flag className="w-5 h-5 text-red-500" />
            {title}
          </DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            {subtitle}
          </DrawerDescription>
        </DrawerHeader>

        <div 
          className="flex-1 px-4 pb-6 overflow-y-auto overscroll-contain space-y-4"
          style={{ maxHeight: 'calc(90vh - 160px)', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Reason Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">{_copy("copy.194c91101778", { defaultValue: "Why are you reporting this?" })}</Label>
            {isLoadingReasons ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            ) : (
              <RadioGroup 
                value={selectedReason} 
                onValueChange={setSelectedReason}
                className="space-y-2"
              >
                {reasons.map((reason) => (
                  <div
                    key={reason.id}
                    className={`flex items-center space-x-3 rounded-xl p-3 cursor-pointer transition-colors ${
                      selectedReason === reason.id
                        ? 'bg-white/10 border border-white/20'
                        : 'bg-white/5 border border-transparent hover:bg-white/10'
                    }`}
                    onClick={() => setSelectedReason(reason.id)}
                  >
                    <RadioGroupItem 
                      value={reason.id} 
                      id={reason.id} 
                      className="border-white/40 text-white data-[state=checked]:bg-white data-[state=checked]:border-white"
                    />
                    <Label 
                      htmlFor={reason.id} 
                      className="text-sm text-white cursor-pointer flex-1"
                    >
                      {reason.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>

          {/* Additional Details */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-zinc-300">{_copy("copy.d3eefb6a33d1", { defaultValue: "Additional details (optional)" })}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-white/5 border-white/10 text-white min-h-[100px] rounded-xl resize-none"
              maxLength={500}
              placeholder={reportType === 'comment' ? t('comments.reportReasonPlaceholder') : undefined}
            />
            <p className="text-xs text-zinc-500 text-right">
              {description.length}/500
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 text-zinc-400 hover:text-white hover:bg-white/10"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedReason || isSubmitting}
              variant="glass"
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />{_copy("copy.64115d5b9c79", { defaultValue: "Submitting..." })}</>
              ) : (
                _copy("copy.e7e72948c5d5", { defaultValue: "Submit Report" })
              )}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
