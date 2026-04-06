/**
 * ShareImageCard
 * ==============
 * Off-screen card rendered for html2canvas capture.
 * Produces a 600×315 dark card used as the social share image.
 */

import { forwardRef } from 'react';

interface ShareImageCardProps {
  authorName: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  title?: string;
  content?: string;
  postUrl: string;
}

export const ShareImageCard = forwardRef<HTMLDivElement, ShareImageCardProps>(
  ({ authorName, authorHandle, authorAvatarUrl, title, content, postUrl }, ref) => {
    const handle = authorHandle
      ? authorHandle.startsWith('@') ? authorHandle : `@${authorHandle}`
      : null;

    const isRealAvatar = authorAvatarUrl?.startsWith('http');

    // Truncate content so it fits nicely in the card
    const displayContent = content && content.length > 280 ? content.slice(0, 277) + '…' : content;
    const displayTitle = title && title.length > 80 ? title.slice(0, 77) + '…' : title;

    return (
      <div
        ref={ref}
        style={{
          position: 'absolute',
          top: 0,
          left: '-9999px',
          width: '600px',
          background: '#09090b',
          borderRadius: '16px',
          padding: '32px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          boxSizing: 'border-box',
        }}
      >
        {/* Header: DeHub logo + dehub.app */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <img
            src="/dehub-header-logo.png"
            alt="DeHub"
            style={{ height: '22px', opacity: 0.9 }}
            crossOrigin="anonymous"
          />
          <span style={{ color: '#52525b', fontSize: '13px', fontWeight: 500 }}>dehub.app</span>
        </div>

        {/* Author row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          {isRealAvatar ? (
            <img
              src={authorAvatarUrl}
              alt={authorName}
              crossOrigin="anonymous"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                objectFit: 'cover',
                background: '#27272a',
              }}
            />
          ) : (
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#3f3f46',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                color: '#a1a1aa',
                fontWeight: 700,
              }}
            >
              {authorName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ color: '#ffffff', fontWeight: 600, fontSize: '15px', lineHeight: 1.3 }}>
              {authorName}
            </div>
            {handle && (
              <div style={{ color: '#71717a', fontSize: '13px', marginTop: '2px' }}>{handle}</div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: '#27272a', marginBottom: '20px' }} />

        {/* Post content */}
        <div>
          {displayTitle && (
            <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '18px', lineHeight: 1.4, marginBottom: '10px' }}>
              {displayTitle}
            </div>
          )}
          {displayContent && (
            <div style={{ color: '#d4d4d8', fontSize: '15px', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {displayContent}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#3f3f46', fontSize: '12px', wordBreak: 'break-all', maxWidth: '75%' }}>
            {postUrl}
          </span>
          <img
            src="/dehub-icon.png"
            alt="DeHub"
            crossOrigin="anonymous"
            style={{ width: '24px', height: '24px', opacity: 0.3 }}
          />
        </div>
      </div>
    );
  }
);

ShareImageCard.displayName = 'ShareImageCard';
