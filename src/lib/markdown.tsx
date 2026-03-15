/**
 * Markdown Renderer Utility
 * =========================
 * Converts markdown syntax to React elements for proper formatting.
 * 
 * RULE: All AI-generated text MUST be rendered through this utility
 * to ensure proper formatting (bold, italic, lists, links, etc.)
 */

import React, { useState } from 'react';
import { Mail, Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Inline email copy button - shows mail icon, copies email on click.
 */
function EmailCopyButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      toast.success('Email copied');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleClick}
      title={copied ? 'Copied!' : `Copy ${email}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors text-xs text-white/70 hover:text-white align-middle"
    >
      {copied ? <Check className="w-3 h-3 text-white" /> : <Mail className="w-3 h-3" />}
      <span className="sr-only">{email}</span>
    </button>
  );
}

interface MarkdownTextProps {
  content: string;
  className?: string;
}

/**
 * Parses and renders markdown text with proper formatting.
 * Supports: **bold**, *italic*, `code`, - lists, numbered lists, [links](url), plain URLs
 */
export function MarkdownText({ content, className = '' }: MarkdownTextProps) {
  const renderContent = () => {
    // Split into lines to handle lists and paragraphs
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];
    let listType: 'ul' | 'ol' | null = null;
    let currentListStart = 0;

    const flushList = () => {
      if (listItems.length > 0 && listType) {
        const ListTag = listType;
        elements.push(
          <ListTag key={`list-${currentListStart}`} className={listType === 'ul' ? 'list-disc list-inside space-y-1 my-2' : 'list-decimal list-inside space-y-1 my-2'}>
            {listItems}
          </ListTag>
        );
        listItems = [];
        listType = null;
      }
    };

    lines.forEach((line, lineIndex) => {
      // Check for unordered list
      const ulMatch = line.match(/^[-*]\s+(.+)$/);
      // Check for ordered list
      const olMatch = line.match(/^\d+\.\s+(.+)$/);

      if (ulMatch) {
        if (listType !== 'ul') {
          flushList();
          listType = 'ul';
          currentListStart = lineIndex;
        }
        listItems.push(
          <li key={lineIndex}>{parseInlineMarkdown(ulMatch[1])}</li>
        );
      } else if (olMatch) {
        if (listType !== 'ol') {
          flushList();
          listType = 'ol';
          currentListStart = lineIndex;
        }
        listItems.push(
          <li key={lineIndex}>{parseInlineMarkdown(olMatch[1])}</li>
        );
      } else {
        flushList();
        if (line.trim() === '') {
          // Empty line - add spacing
          elements.push(<br key={`br-${lineIndex}`} />);
        } else {
          // Check for headings (###, ##, #)
          const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const headingText = headingMatch[2];
            const sizeClass = level <= 1 ? 'text-lg font-bold' : level === 2 ? 'text-base font-bold' : 'text-sm font-bold';
            elements.push(
              <span key={lineIndex} className={`block ${sizeClass} mt-3 mb-1`}>
                {parseInlineMarkdown(headingText)}
              </span>
            );
          } else {
            elements.push(
              <span key={lineIndex} className="block">
                {parseInlineMarkdown(line)}
              </span>
            );
          }
        }
      }
    });

    flushList();
    return elements;
  };

  return <div className={className}>{renderContent()}</div>;
}

/**
 * Parses inline markdown (bold, italic, code, links) within a line.
 */
function parseInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Markdown links: [text](url)
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)$/s);
    if (linkMatch) {
      if (linkMatch[1]) {
        parts.push(<span key={keyIndex++}>{parseFormattingAndUrls(linkMatch[1])}</span>);
      }
      parts.push(
        <a 
          key={keyIndex++} 
          href={linkMatch[3]} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-white underline hover:opacity-80"
        >
          {linkMatch[2]}
        </a>
      );
      remaining = linkMatch[4];
      continue;
    }

    // Bold: **text** or __text__
    const boldMatch = remaining.match(/^(.*?)(\*\*|__)(.+?)\2(.*)$/s);
    if (boldMatch) {
      if (boldMatch[1]) {
        parts.push(<span key={keyIndex++}>{parseLinksAndUrls(boldMatch[1])}</span>);
      }
      parts.push(<strong key={keyIndex++} className="font-semibold">{parseItalicAndCode(boldMatch[3])}</strong>);
      remaining = boldMatch[4];
      continue;
    }

    // If no match found, try italic and code, then add remaining as text
    const italicMatch = remaining.match(/^(.*?)(\*|_)(.+?)\2(.*)$/s);
    if (italicMatch) {
      if (italicMatch[1]) {
        parts.push(<span key={keyIndex++}>{parseLinksAndUrls(italicMatch[1])}</span>);
      }
      parts.push(<em key={keyIndex++} className="italic">{parseCode(italicMatch[3])}</em>);
      remaining = italicMatch[4];
      continue;
    }

    // Code: `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)$/s);
    if (codeMatch) {
      if (codeMatch[1]) {
        parts.push(<span key={keyIndex++}>{parseLinksAndUrls(codeMatch[1])}</span>);
      }
      parts.push(
        <code key={keyIndex++} className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-mono">
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }

    // No more matches, parse remaining for plain URLs
    parts.push(<span key={keyIndex++}>{parseLinksAndUrls(remaining)}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/**
 * Parses markdown links and plain URLs in text
 */
function parseLinksAndUrls(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Email regex - matches email addresses before URL detection
    const emailMatch = remaining.match(/^(.*?)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(.*)$/s);
    // Plain URL regex - matches http(s) URLs
    const urlMatch = remaining.match(/^(.*?)(https?:\/\/[^\s<>\[\]()]+)(.*)$/s);

    // Pick whichever match comes first
    const emailFirst = emailMatch && (!urlMatch || emailMatch[1].length <= urlMatch[1].length);

    if (emailFirst && emailMatch) {
      if (emailMatch[1]) {
        parts.push(<span key={keyIndex++}>{emailMatch[1]}</span>);
      }
      const email = emailMatch[2];
      parts.push(<EmailCopyButton key={keyIndex++} email={email} />);
      remaining = emailMatch[3];
      continue;
    }

    if (urlMatch) {
      if (urlMatch[1]) {
        parts.push(<span key={keyIndex++}>{urlMatch[1]}</span>);
      }
      // Clean up URL (remove trailing punctuation that's likely not part of the URL)
      let url = urlMatch[2];
      let trailing = '';
      const trailingMatch = url.match(/([.,;:!?)]+)$/);
      if (trailingMatch) {
        trailing = trailingMatch[1];
        url = url.slice(0, -trailing.length);
      }
      parts.push(
        <a 
          key={keyIndex++} 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-white underline hover:opacity-80 break-all"
        >
          {url}
        </a>
      );
      remaining = trailing + urlMatch[3];
      continue;
    }

    parts.push(<span key={keyIndex++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/**
 * Parses formatting and URLs together
 */
function parseFormattingAndUrls(text: string): React.ReactNode {
  return parseLinksAndUrls(text);
}

function parseItalicAndCode(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Italic: *text* or _text_ (single)
    const italicMatch = remaining.match(/^(.*?)(?<!\*)(\*|_)(?!\*)(.+?)(?<!\*)\2(?!\*)(.*)$/s);
    if (italicMatch) {
      if (italicMatch[1]) {
        parts.push(<span key={keyIndex++}>{parseCode(italicMatch[1])}</span>);
      }
      parts.push(<em key={keyIndex++} className="italic">{parseCode(italicMatch[3])}</em>);
      remaining = italicMatch[4];
      continue;
    }

    // Code
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)$/s);
    if (codeMatch) {
      if (codeMatch[1]) {
        parts.push(<span key={keyIndex++}>{codeMatch[1]}</span>);
      }
      parts.push(
        <code key={keyIndex++} className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-mono">
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }

    parts.push(<span key={keyIndex++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function parseCode(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)$/s);
    if (codeMatch) {
      if (codeMatch[1]) {
        parts.push(<span key={keyIndex++}>{codeMatch[1]}</span>);
      }
      parts.push(
        <code key={keyIndex++} className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-mono">
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }

    parts.push(<span key={keyIndex++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
