import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Blog from '@/components/ui/cut-icons/blog';
import type { ArticleTileLook } from '@/lib/article-tile';
import './profile-mixed-grid.css';

/** The article tile look for the profile being viewed. */
export const ProfileArticleTileContext = createContext<ArticleTileLook>('cover');
export const useProfileArticleTile = () => useContext(ProfileArticleTileContext);

interface FaceProps {
  look: ArticleTileLook;
  cover?: string;
  title: string;
  minutes: number;
  views?: string;
  eager?: boolean;
}

/**
 * The inside of an article tile. Cover: the cover fills the tile and a glass
 * bar holds the title, reading time and views, like a video tile's meta row.
 * Drop cap: a big serif first letter and the title over a soft cover.
 */
export function ArticleTileFace({ look, cover, title, minutes, views, eager }: FaceProps) {
  const { t } = useTranslation();
  const read = t('profile.articleMinRead', '{{count}} min read', { count: minutes });
  if (look === 'dropcap') {
    return (
      <>
        {cover && <img src={cover} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" className="pmg-adrop-bg" />}
        <span className="pmg-adrop-tint" />
        <span className="pmg-adrop-body">
          <span className="pmg-adrop-cap" aria-hidden>{title.charAt(0)}</span>
          <b>{title}</b>
          <span className="pmg-adrop-rule" />
          <span className="pmg-adrop-meta"><Blog />{read}</span>
        </span>
      </>
    );
  }
  return (
    <>
      {cover ? <img src={cover} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" className="pmg-img" /> : <span className="pmg-img pmg-acov-empty"><Blog /></span>}
      <span className="pmg-acov-bar">
        <b>{title}</b>
        <span className="pmg-acov-meta"><span>{read}</span>{views && <span>{t('profile.articleViews', '{{views}} views', { views })}</span>}</span>
      </span>
    </>
  );
}

interface PickerProps {
  open: boolean;
  current: ArticleTileLook;
  sample: { cover?: string; title: string; minutes: number; views?: string };
  saving?: boolean;
  onCancel: () => void;
  onSave: (look: ArticleTileLook) => void;
}

/** Hold one of your articles on your profile: pick how all of them look. */
export function ArticleTilePicker({ open, current, sample, saving, onCancel, onSave }: PickerProps) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<ArticleTileLook>(current);
  useEffect(() => {
    if (!open) return;
    setSel(current);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, current]);
  if (!open || typeof document === 'undefined') return null;

  const option = (look: ArticleTileLook, label: string) => (
    <button key={look} type="button" role="radio" aria-checked={sel === look} className="atp-option" onClick={() => setSel(look)}>
      <span className={look === 'dropcap' ? 'pmg-tile atp-tile pmg-adrop' : 'pmg-tile atp-tile'} data-look={look}>
        <ArticleTileFace look={look} {...sample} eager />
      </span>
      <span className="atp-label">{label}</span>
    </button>
  );

  return createPortal(
    <div className="pbg-picker" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div
        className="pbg-picker-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('articleTile.title', 'Article tiles')}
        tabIndex={-1}
        ref={(el) => el?.focus({ preventScroll: true })}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
      >
        <div className="pbg-picker-top">
          <button type="button" className="pbg-picker-btn" onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
          <h2>{t('articleTile.title', 'Article tiles')}</h2>
          <button type="button" className="pbg-picker-btn pbg-picker-btn--done" disabled={saving} onClick={() => onSave(sel)}>
            <span>{saving ? t('postBg.saving', 'Saving') : t('common.done', 'Done')}</span>
          </button>
        </div>
        <div className="atp-stage" data-profile-mixed-grid role="radiogroup" aria-label={t('articleTile.title', 'Article tiles')}>
          {option('cover', t('articleTile.cover', 'Cover'))}
          {option('dropcap', t('articleTile.dropcap', 'Drop cap'))}
        </div>
        <p className="pbg-picker-hint">{t('articleTile.hint', 'How your articles look on your profile grid. Only you can change this.')}</p>
      </div>
    </div>,
    document.body,
  );
}
