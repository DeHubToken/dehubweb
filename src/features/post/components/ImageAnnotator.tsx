/**
 * Image Annotator
 * ===============
 * Draw on, and write on, an image before it is posted.
 *
 * Unlike the filter and crop sheets, this one is **destructive on apply**: it
 * hands back a new File with the marks already burned in, and the caller drops
 * the filter/crop settings because the image it was given here was already
 * flattened with those applied. That is deliberate — annotation coordinates
 * only mean anything against the frame the user actually drew on, and keeping
 * them re-editable would mean re-deriving every stroke each time the crop box
 * moved. Undo and Clear cover the editing that matters, before Apply.
 *
 * Everything is stored in normalised (0..1) coordinates so the on-screen
 * preview and the full-resolution bake are the same drawing at two sizes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { X, Check, Pencil, Type, Undo2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tool = 'draw' | 'text';

interface Point {
  x: number;
  y: number;
}

interface StrokeItem {
  kind: 'stroke';
  points: Point[];
  color: string;
  /** Line width as a fraction of the image's shorter side. */
  width: number;
}

interface TextItem {
  kind: 'text';
  at: Point;
  text: string;
  color: string;
  /** Font size as a fraction of the image's shorter side. */
  size: number;
}

type Annotation = StrokeItem | TextItem;

interface ImageAnnotatorProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  fileName: string;
  fileType: string;
  onApply: (file: File) => void;
}

const COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2'];

/** Brush sizes as a fraction of the image's shorter side. */
const BRUSH_SIZES = [0.006, 0.014, 0.028];
/** Text sizes as a fraction of the image's shorter side. */
const TEXT_SIZES = [0.05, 0.08, 0.13];

const FONT_STACK = '600 {size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Draw the annotations onto a context whose coordinate space is `w` x `h`.
 * Shared by the on-screen preview and the full-resolution bake so the two can
 * never drift.
 */
function paintAnnotations(ctx: CanvasRenderingContext2D, items: Annotation[], w: number, h: number) {
  const unit = Math.min(w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'middle';

  for (const item of items) {
    if (item.kind === 'stroke') {
      if (item.points.length === 0) continue;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = Math.max(1, item.width * unit);
      ctx.beginPath();
      // A single tap is a dot, not a zero-length line no engine will paint.
      if (item.points.length === 1) {
        const p = item.points[0];
        ctx.arc(p.x * w, p.y * h, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        continue;
      }
      ctx.moveTo(item.points[0].x * w, item.points[0].y * h);
      for (let i = 1; i < item.points.length; i++) {
        ctx.lineTo(item.points[i].x * w, item.points[i].y * h);
      }
      ctx.stroke();
    } else {
      const fontSize = Math.max(8, item.size * unit);
      ctx.font = FONT_STACK.replace('{size}', String(fontSize));
      // A dark outline keeps light text legible on a light photo, and vice
      // versa — cheaper and more reliable than sampling the pixels underneath.
      ctx.lineWidth = Math.max(1, fontSize * 0.12);
      ctx.strokeStyle = item.color === '#000000' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(item.text, item.at.x * w, item.at.y * h);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, item.at.x * w, item.at.y * h);
    }
  }
}

export function ImageAnnotator({ isOpen, onClose, imageUrl, fileName, fileType, onApply }: ImageAnnotatorProps) {
  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState(COLORS[2]);
  const [sizeStep, setSizeStep] = useState(1);
  const [items, setItems] = useState<Annotation[]>([]);
  const [pendingText, setPendingText] = useState<{ at: Point; value: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);

  // Reopening on a different image must not inherit the last one's marks.
  useEffect(() => {
    if (!isOpen) return;
    setItems([]);
    setPendingText(null);
    setTool('draw');
  }, [isOpen, imageUrl]);

  // Load the source image once per open.
  useEffect(() => {
    if (!isOpen) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = imageUrl;
    return () => {
      imageRef.current = null;
    };
  }, [isOpen, imageUrl]);

  const aspect = imageSize ? imageSize.w / imageSize.h : 1;

  // Repaint the preview whenever anything visible changes.
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !img || !wrap) return;

    const box = wrap.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.drawImage(img, 0, 0, box.width, box.height);
    paintAnnotations(ctx, items, box.width, box.height);
  }, [items]);

  useEffect(() => {
    repaint();
  }, [repaint, imageSize]);

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => repaint();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, repaint]);

  const pointFromEvent = useCallback((e: React.PointerEvent): Point | null => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const box = wrap.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    const p = pointFromEvent(e);
    if (!p) return;

    if (tool === 'text') {
      setPendingText({ at: p, value: '' });
      return;
    }

    // A text box being typed loses focus to the drawing, and an empty one
    // should not leave an invisible item behind.
    setPendingText(null);
    drawingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setItems((prev) => [
      ...prev,
      { kind: 'stroke', points: [p], color, width: BRUSH_SIZES[sizeStep] },
    ]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = pointFromEvent(e);
    if (!p) return;
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.kind !== 'stroke') return prev;
      return [...prev.slice(0, -1), { ...last, points: [...last.points, p] }];
    });
  };

  const endStroke = () => {
    drawingRef.current = false;
  };

  const commitText = () => {
    if (!pendingText) return;
    const text = pendingText.value.trim();
    if (text) {
      setItems((prev) => [
        ...prev,
        { kind: 'text', at: pendingText.at, text, color, size: TEXT_SIZES[sizeStep] },
      ]);
    }
    setPendingText(null);
  };

  const undo = () => {
    setPendingText(null);
    setItems((prev) => prev.slice(0, -1));
  };

  const clearAll = () => {
    setPendingText(null);
    setItems([]);
  };

  const hasWork = items.length > 0 || !!pendingText?.value.trim();

  const handleApply = async () => {
    // Anything still being typed counts as work the user meant to keep.
    let finalItems = items;
    if (pendingText && pendingText.value.trim()) {
      finalItems = [
        ...items,
        { kind: 'text', at: pendingText.at, text: pendingText.value.trim(), color, size: TEXT_SIZES[sizeStep] },
      ];
    }

    const img = imageRef.current;
    if (!img || finalItems.length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      paintAnnotations(ctx, finalItems, canvas.width, canvas.height);

      // PNG and WebP keep their type so transparency survives; everything else
      // goes out JPEG, matching how filters and crops bake.
      const outType = fileType === 'image/png' || fileType === 'image/webp' ? fileType : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outType, 0.92));
      if (!blob) throw new Error('toBlob returned nothing');
      onApply(new File([blob], fileName, { type: blob.type }));
      onClose();
    } catch (err) {
      console.warn('[Annotate] Could not bake the drawing:', err);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const sizeDots = useMemo(() => (tool === 'text' ? [10, 14, 18] : [4, 8, 14]), [tool]);

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent column hideHandle className="bg-zinc-950 border-zinc-800 max-h-[90dvh] overflow-hidden flex flex-col">
        <DrawerTitle className="sr-only">Draw on image</DrawerTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
          <span className="text-white font-semibold">Draw & write</span>
          <button
            onClick={handleApply}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50
              bg-white/10 backdrop-blur-xl border border-white/20
              hover:bg-white/20 hover:border-white/40"
          >
            <Check className="w-4 h-4" />
            Apply
          </button>
        </div>

        {/* Canvas */}
        <div className="flex items-center justify-center p-4 bg-black/50 min-h-0 flex-1 overflow-hidden">
          <div
            ref={wrapRef}
            className="relative max-w-full max-h-[52dvh] touch-none select-none"
            style={{ aspectRatio: String(aspect), width: 'min(100%, 560px)' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={endStroke}
          >
            <canvas
              ref={canvasRef}
              className={cn(
                'absolute inset-0 w-full h-full rounded-lg shadow-2xl',
                tool === 'text' ? 'cursor-text' : 'cursor-crosshair',
              )}
            />
            {pendingText && (
              <input
                autoFocus
                value={pendingText.value}
                onChange={(e) => setPendingText({ ...pendingText, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitText();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setPendingText(null);
                  }
                  e.stopPropagation();
                }}
                onBlur={commitText}
                placeholder="Type…"
                maxLength={120}
                className="absolute -translate-y-1/2 min-w-[120px] max-w-[80%] bg-black/70 backdrop-blur-xl border border-white/30 rounded-lg px-2 py-1 text-sm outline-none"
                style={{
                  left: `${pendingText.at.x * 100}%`,
                  top: `${pendingText.at.y * 100}%`,
                  color,
                }}
              />
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="border-t border-zinc-800 px-4 py-3 shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setPendingText(null); setTool('draw'); }}
                aria-label="Draw"
                className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-xl border transition-colors',
                  tool === 'draw'
                    ? 'bg-white/20 border-white/40 text-white'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10',
                )}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setTool('text')}
                aria-label="Add text"
                className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-xl border transition-colors',
                  tool === 'text'
                    ? 'bg-white/20 border-white/40 text-white'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10',
                )}
              >
                <Type className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {sizeDots.map((dot, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSizeStep(i)}
                  aria-label={`Size ${i + 1}`}
                  className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-xl border transition-colors',
                    sizeStep === i
                      ? 'bg-white/20 border-white/40'
                      : 'bg-white/5 border-white/10 hover:bg-white/10',
                  )}
                >
                  <span
                    className="rounded-full bg-white block"
                    style={{ width: dot, height: dot }}
                  />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={undo}
                disabled={!hasWork}
                aria-label="Undo"
                className="flex items-center justify-center w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={!hasWork}
                aria-label="Clear"
                className="flex items-center justify-center w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                className={cn(
                  'w-7 h-7 shrink-0 rounded-full border-2 transition-transform',
                  color === c ? 'border-white scale-110' : 'border-white/20 hover:scale-105',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
