/**
 * ImageMarkupDialog
 * =================
 * Draw on a screenshot before it goes into a request: circle the broken
 * button, underline the wrong label. Strokes are drawn straight onto a copy of
 * the image, and Done hands back a PNG that replaces the attachment.
 *
 * @module components/app/features/ImageMarkupDialog
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Long edge of the saved image; a phone screenshot keeps its detail. */
const MAX_EDGE = 2000;
const PEN_COLORS = ['#ff3b30', '#ffd60a', '#0a84ff', '#ffffff'];

type Stroke = { color: string; width: number; points: Array<[number, number]> };

interface ImageMarkupDialogProps {
  file: File | null;
  onClose: () => void;
  onSave: (file: File) => void;
}

export function ImageMarkupDialog({ file, onClose, onSave }: ImageMarkupDialogProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [strokeCount, setStrokeCount] = useState(0);
  const [ready, setReady] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !image || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current;
    for (const stroke of all) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      stroke.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0][0] + 0.1, stroke.points[0][1]);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    if (!file) return;
    setReady(false);
    strokesRef.current = [];
    drawingRef.current = null;
    setStrokeCount(0);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
      }
      setReady(true);
      redraw();
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, redraw]);

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * canvas.width,
      ((event.clientY - rect.top) / rect.height) * canvas.height,
    ];
  };

  const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const canvas = event.currentTarget;
    // About 0.6% of the long edge: a clear mark on a phone screenshot and a laptop one.
    const width = Math.max(4, Math.round(Math.max(canvas.width, canvas.height) * 0.006));
    drawingRef.current = { color, width, points: [pointFor(event)] };
    redraw();
  };

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(pointFor(event));
    redraw();
  };

  const handleUp = () => {
    if (!drawingRef.current) return;
    strokesRef.current = [...strokesRef.current, drawingRef.current];
    drawingRef.current = null;
    setStrokeCount(strokesRef.current.length);
    redraw();
  };

  const undo = () => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    redraw();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !file) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const base = file.name.replace(/\.[^.]+$/, '') || 'screenshot';
      onSave(new File([blob], `${base}-marked.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] p-3 sm:p-4 gap-3">
        <DialogTitle className="text-base">{t('editor.draw.heading', 'Draw')}</DialogTitle>
        <div className="flex items-center justify-center rounded-lg bg-black/40 overflow-hidden max-h-[65vh]">
          <canvas
            ref={canvasRef}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            className="max-w-full max-h-[65vh] w-auto h-auto touch-none cursor-crosshair"
            aria-label={t('editor.draw.heading', 'Draw')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={t('editor.draw.colour', 'Pen colour')}
              aria-pressed={color === c}
              className={cn(
                'w-7 h-7 rounded-full border-2 transition-transform',
                color === c ? 'border-white scale-110' : 'border-white/20',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <Button type="button" variant="ghost" size="sm" className="rounded-lg" disabled={strokeCount === 0} onClick={undo}>
            {t('common.undo', 'Undo')}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="button" variant="glass" size="sm" className="rounded-lg" disabled={!ready} onClick={save}>
              {t('common.done', 'Done')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
