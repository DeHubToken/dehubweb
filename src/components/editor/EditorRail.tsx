/**
 * Editor rail.
 * ============
 * A Canva-style icon rail with one focused panel beside it. It replaces the
 * single 256px sidebar that crammed the storage meter, text presets, a
 * generate form, a dropzone and the media list into one column, and that only
 * rendered at all above 1280px. The rail works at every width: panels dock
 * from `md` up and open as a bottom sheet below that.
 */
import { Suspense, lazy } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorUiStore, type EditorPanel } from '@/store/editorUiStore';
import { useGenerationStore } from '@/store/generationStore';
import { useEditorStore } from '@/store/editorStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMediaQuery } from '@/hooks/use-media-query';
import { INSPECTOR_TAB, RAIL_TABS } from './railTabs';
import { Inspector } from './Inspector';
import { DesignPanel } from './panels/DesignPanel';
import { TextPanel } from './panels/TextPanel';
import { GeneratePanel } from './panels/GeneratePanel';
import { LibraryPanel } from './panels/LibraryPanel';

// The media panel pulls in IndexedDB and cloud-asset plumbing; keep it out of
// the initial editor chunk since Design is the panel that opens first.
const MediaPanel = lazy(() =>
  import('./MediaPanel').then((m) => ({ default: m.MediaPanel })),
);

export function PanelBody({ panel }: { panel: EditorPanel }) {
  switch (panel) {
    case 'design':
      return <DesignPanel />;
    case 'text':
      return <TextPanel />;
    case 'generate':
      return <GeneratePanel />;
    case 'library':
      return <LibraryPanel />;
    case 'inspector':
      return <Inspector />;
    case 'media':
      return (
        <Suspense
          fallback={<p className="p-4 text-[12px] text-white/40">Loading your media…</p>}
        >
          <MediaPanel />
        </Suspense>
      );
    default:
      return null;
  }
}

/** Vertical icon rail. Docked from `md` up; the mobile bar handles smaller. */
export function EditorRail() {
  const panel = useEditorUiStore((s) => s.panel);
  const togglePanel = useEditorUiStore((s) => s.togglePanel);
  const hasSelection = useEditorStore((s) => s.selectedClipIds.length > 0);
  const runningCount = useGenerationStore((s) =>
    s.jobs.filter((j) => j.status === 'running').length,
  );

  const renderTab = (tab: (typeof RAIL_TABS)[number], extraClass?: string) => {
    const Icon = tab.icon;
    const active = panel === tab.id;
    const badge = tab.id === 'library' && runningCount > 0 ? runningCount : null;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => togglePanel(tab.id)}
        aria-pressed={active}
        aria-label={tab.label}
        className={cn(
          'relative mx-1.5 flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition',
          active ? 'bg-white/[0.14] text-white' : 'text-white/55 hover:bg-white/10 hover:text-white',
          extraClass,
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
        <span className="text-[9.5px] font-medium leading-none">{tab.label}</span>
        {badge !== null && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold tabular-nums text-black">
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav
      aria-label="Editor tools"
      className="hidden w-[4.5rem] shrink-0 flex-col gap-1 border-r border-white/10 bg-black/60 py-2 backdrop-blur-[24px] md:flex"
    >
      {RAIL_TABS.map((tab) => renderTab(tab))}

      {/* Below lg the inspector has no column of its own, so it becomes a tab. */}
      {hasSelection && renderTab(INSPECTOR_TAB, 'mt-1 border-t border-white/10 pt-3 lg:hidden')}
    </nav>
  );
}

/** Docked panel column beside the rail. */
export function EditorPanelColumn() {
  const panel = useEditorUiStore((s) => s.panel);
  const setPanel = useEditorUiStore((s) => s.setPanel);
  const isMobile = useIsMobile();
  const isWide = useMediaQuery('(min-width: 1024px)');

  // Below md the phone sheet renders this panel instead, so bail out to keep
  // exactly one PanelBody mounted: two would duplicate element ids and effects.
  // The responsive classes below are the belt to this braces, covering the
  // first paint before useIsMobile has resolved.
  if (!panel || isMobile) return null;

  // From lg up the inspector has its own right-hand column (see Editor.tsx), so
  // rendering it here too would put two Inspectors side by side, each editing
  // the same clip. The rail tab that sets this is itself lg:hidden.
  if (panel === 'inspector' && isWide) return null;
  const tab = [...RAIL_TABS, INSPECTOR_TAB].find((t) => t.id === panel);

  return (
    <aside className="hidden h-full w-72 shrink-0 flex-col border-r border-white/10 bg-black/60 backdrop-blur-[24px] md:flex lg:w-80">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <h2 className="text-[12px] font-semibold text-white/85">{tab?.label}</h2>
        <button
          type="button"
          onClick={() => setPanel(null)}
          aria-label="Collapse panel"
          className="rounded-md p-1 text-white/45 transition hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <PanelBody panel={panel} />
      </div>
    </aside>
  );
}
