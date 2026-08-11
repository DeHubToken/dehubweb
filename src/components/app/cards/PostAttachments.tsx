/**
 * Download list for the documents on a `feed-file` post.
 *
 * Every attachment is stored on the CDN with `Content-Disposition: attachment`,
 * so these are plain links — the browser downloads rather than navigates, and
 * nothing an uploader supplied is ever rendered as markup. `rel="noopener
 * noreferrer"` is belt-and-braces for the same reason.
 */
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  FileArchive,
  FileCode,
  BookOpen,
  File as FileIcon,
  Download,
} from 'lucide-react';
import { getMediaUrl } from '@/lib/api/dehub';
import {
  formatAttachmentSize,
  getAttachmentKind,
  getAttachmentLabel,
  type AttachmentKind,
  type PostAttachment,
} from '@/lib/attachments';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<AttachmentKind, typeof FileIcon> = {
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  archive: FileArchive,
  code: FileCode,
  ebook: BookOpen,
  file: FileIcon,
};

interface PostAttachmentsProps {
  attachments?: PostAttachment[];
  className?: string;
}

export function PostAttachments({ attachments, className }: PostAttachmentsProps) {
  if (!attachments?.length) return null;

  return (
    <ul className={cn('space-y-2', className)}>
      {attachments.map((attachment, index) => {
        const kind = getAttachmentKind(attachment.name);
        const Icon = KIND_ICON[kind];
        // Stored keys are CDN-relative; getMediaUrl passes an absolute URL
        // through untouched, so a future move off this bucket needs no change here.
        const href = getMediaUrl(attachment.url);
        if (!href) return null;

        return (
          <li key={`${attachment.url}-${index}`}>
            <a
              href={href}
              download={attachment.name}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors hover:bg-white/[0.07]"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                <Icon className="h-4 w-4 text-white" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white" title={attachment.name}>
                  {attachment.name}
                </span>
                <span className="block text-xs text-white/50">
                  {getAttachmentLabel(attachment.name)} · {formatAttachmentSize(attachment.size)}
                </span>
              </span>

              <Download className="h-4 w-4 flex-shrink-0 text-white/40 transition-colors group-hover:text-white/80" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
