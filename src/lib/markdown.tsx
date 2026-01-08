/**
 * Markdown Renderer Utility
 * =========================
 * Converts markdown syntax to React elements for proper formatting.
 * 
 * RULE: All AI-generated text MUST be rendered through this utility
 * to ensure proper formatting (bold, italic, lists, etc.)
 */

import React from 'react';

interface MarkdownTextProps {
  content: string;
  className?: string;
}

/**
 * Parses and renders markdown text with proper formatting.
 * Supports: **bold**, *italic*, `code`, - lists, numbered lists
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
          elements.push(
            <span key={lineIndex} className="block">
              {parseInlineMarkdown(line)}
            </span>
          );
        }
      }
    });

    flushList();
    return elements;
  };

  return <div className={className}>{renderContent()}</div>;
}

/**
 * Parses inline markdown (bold, italic, code) within a line.
 */
function parseInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Bold: **text** or __text__
    const boldMatch = remaining.match(/^(.*?)(\*\*|__)(.+?)\2(.*)$/s);
    if (boldMatch) {
      if (boldMatch[1]) {
        parts.push(<span key={keyIndex++}>{parseItalicAndCode(boldMatch[1])}</span>);
      }
      parts.push(<strong key={keyIndex++} className="font-semibold">{parseItalicAndCode(boldMatch[3])}</strong>);
      remaining = boldMatch[4];
      continue;
    }

    // If no match found, try italic and code, then add remaining as text
    const italicMatch = remaining.match(/^(.*?)(\*|_)(.+?)\2(.*)$/s);
    if (italicMatch) {
      if (italicMatch[1]) {
        parts.push(<span key={keyIndex++}>{parseCode(italicMatch[1])}</span>);
      }
      parts.push(<em key={keyIndex++} className="italic">{parseCode(italicMatch[3])}</em>);
      remaining = italicMatch[4];
      continue;
    }

    // Code: `text`
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

    // No more matches, add remaining text
    parts.push(<span key={keyIndex++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
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
