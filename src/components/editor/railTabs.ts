/**
 * Editor rail tabs.
 * =================
 * Shared by the docked rail and the phone bottom bar so both always offer the
 * same five tools in the same order. Kept in its own module so the rail file
 * only exports components and stays hot-reloadable.
 */
import { ImagePlus, LayoutTemplate, SlidersHorizontal, Sparkles, Type, Wand2 } from 'lucide-react';
import type { EditorPanel } from '@/store/editorUiStore';

export interface RailTab {
  id: EditorPanel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const RAIL_TABS: RailTab[] = [
  { id: 'design', label: 'Design', icon: LayoutTemplate },
  { id: 'media', label: 'Media', icon: ImagePlus },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'generate', label: 'Generate', icon: Sparkles },
  { id: 'library', label: 'Generations', icon: Wand2 },
];

/**
 * The inspector is contextual, so it is not part of the permanent rail. It gets
 * its own right-hand column from `lg` up; below that it appears as a rail tab
 * whenever a clip is selected. Without this, tablet widths between 768 and
 * 1024 could select a clip and then have no way to adjust it.
 */
export const INSPECTOR_TAB: RailTab = {
  id: 'inspector',
  label: 'Edit',
  icon: SlidersHorizontal,
};
