/**
 * DescriptionWithLinks
 * =====================
 * Renders a description with URLs extracted and shown as link emoji icons below.
 */

import { Link as LinkIcon } from 'lucide-react';

const URL_REGEX = /https?:\/\/[^\s)<>]+/gi;

function extractUrls(text: string): string[] {
  return text.match(URL_REGEX) || [];
}

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '');
  }
}

export function DescriptionWithLinks({ text }: { text: string }) {
  const links = extractUrls(text);
  const descWithoutLinks = text.replace(URL_REGEX, '').trim();

  return (
    <div className="space-y-1.5">
      {descWithoutLinks && (
        <p className="text-zinc-400 text-sm whitespace-pre-wrap">{descWithoutLinks}</p>
      )}
      {links.slice(0, 3).map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-[250px]"
          onClick={e => e.stopPropagation()}
        >
          <LinkIcon className="w-3 h-3 shrink-0" />
          <span className="truncate">{cleanUrl(url)}</span>
        </a>
      ))}
    </div>
  );
}
