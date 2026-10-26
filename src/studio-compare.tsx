import './i18n';
import './index.css';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudioStage } from '@/components/app/live/studio/StudioStage';
import { createOverlayEventBus, OverlayEventContext } from '@/components/app/live/overlay/overlay-events';
import { createRuleBus, RuleBusContext } from '@/components/app/live/overlay/rule-bus';
import { newWidget } from '@/lib/live-overlay/registry';
import { createOverlayPainter } from '@/lib/studio/overlay-painter';

const P = new URLSearchParams(location.search);
// kind:x,y,w,h (fractions)
const spec = (P.get('k') || [
  'follow_alert:0.03,0.05,0.34,0.13',
  'goal_bar:0.03,0.22,0.34,0.11',
  'viewer_count:0.03,0.37,0.11,0.07',
  'stream_timer:0.16,0.37,0.11,0.07',
  'top_supporters:0.70,0.05,0.27,0.30',
  'text:0.03,0.80,0.40,0.12',
  'chat_box:0.70,0.42,0.27,0.30',
  'ticker:0,0.94,1,0.06',
].join('|')).split('|');
const widgets: any[] = [];
for (const s of spec) {
  const [k, r] = s.split(':');
  const w: any = newWidget(k as any, widgets);
  if (r) { const [x, y, ww, h] = r.split(',').map(Number); w.landscape = { x, y, w: ww, h }; }
  if (k === 'text') w.settings = { ...w.settings, text: 'Mal · DeHub', subtext: 'Building the home of creators', style: 'lower_third' };
  if (k === 'goal_bar') w.settings = { ...w.settings, title: 'New mic fund', target: 1000 };
  if (k === 'ticker') w.settings = { ...w.settings, text: 'Follow for daily streams  •  Gifts go straight to the creator  •  dehub.io' };
  widgets.push(w);
}
const stats = { totalTips: 640, followers: 40, startedAt: new Date(Date.now() - 3725000).toISOString() } as any;
const bus = createOverlayEventBus();
const ruleBus = createRuleBus();
const qc = new QueryClient();
createRoot(document.getElementById('dom')!).render(
  <QueryClientProvider client={qc}>
    <OverlayEventContext.Provider value={bus}>
      <RuleBusContext.Provider value={ruleBus}>
        <div style={{ width: 1280, height: 720 }}>
          <StudioStage widgets={widgets} portrait={false} selectedId={null} stats={stats} onSelect={() => {}} onMove={() => {}} />
        </div>
      </RuleBusContext.Provider>
    </OverlayEventContext.Provider>
  </QueryClientProvider>,
);
const cv = document.getElementById('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d', { alpha: false })!;
const bg = new Image(); bg.src = '/__room.jpg';
const painter = createOverlayPainter();
painter.setOverlay({ renderIn: 'video', widgets, version: 1, stats } as any);
painter.setViewerCount(1284);
painter.setTopSupporters([{ address: '0x1', displayName: 'Alice', total: 52000 }, { address: '0x2', displayName: 'Bob', total: 21000 }, { address: '0x3', displayName: 'Carol', total: 9000 }]);
const events: any[] = [
  { type: 'viewers', count: 1284 },
  { type: 'follow', user: { username: 'satoshi', displayName: 'Satoshi' } },
  { type: 'chat', id: '1', text: 'this overlay is clean 🔥', user: { username: 'carol', displayName: 'Carol' } },
  { type: 'chat', id: '2', text: 'gg', user: { username: 'dan', displayName: 'Dan' } },
  { type: 'tip', amount: 5000, user: { username: 'alice', displayName: 'Alice' }, message: 'Love the stream!' },
];
setTimeout(() => events.forEach((e) => { bus.publish(e); painter.publish(e); }), 1200);
const loop = () => { if (bg.complete) ctx.drawImage(bg, 0, 0, 1280, 720); painter.paint(ctx, 1280, 720, performance.now()); requestAnimationFrame(loop); };
loop();
(window as any).ready = true;
