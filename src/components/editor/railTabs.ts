/**
 * Editor rail tabs.
 * =================
 * Shared by the docked rail and the phone bottom bar so both always offer the
 * same tools in the same order. Kept in its own module so the rail file
 * only exports components and stays hot-reloadable.
 */
import { Bot, ImagePlus, Layers, LayoutTemplate, LibraryBig, Shapes, SlidersHorizontal, Sparkles, Type, Wand2 } from 'lucide-react';
import type { EditorPanel } from '@/store/editorUiStore';

export interface RailTab {
  id: EditorPanel;
  /** i18n key; render with t(tab.labelKey). */
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const RAIL_TABS: RailTab[] = [
  { id: 'agent', labelKey: 'editor.rail.agent', icon: Bot },
  { id: 'design', labelKey: 'editor.rail.design', icon: LayoutTemplate },
  { id: 'elements', labelKey: 'editor.rail.elements', icon: Shapes },
  { id: 'assets', labelKey: 'editor.rail.assets', icon: LibraryBig },
  { id: 'media', labelKey: 'editor.rail.media', icon: ImagePlus },
  { id: 'text', labelKey: 'editor.rail.text', icon: Type },
  { id: 'layers', labelKey: 'editor.rail.layers', icon: Layers },
  { id: 'generate', labelKey: 'editor.rail.generate', icon: Sparkles },
  { id: 'library', labelKey: 'editor.rail.generations', icon: Wand2 },
];

/**
 * The inspector is contextual, so it is not part of the permanent rail. It gets
 * its own right-hand column from `lg` up; below that it appears as a rail tab
 * whenever a clip is selected. Without this, tablet widths between 768 and
 * 1024 could select a clip and then have no way to adjust it.
 */
export const INSPECTOR_TAB: RailTab = {
  id: 'inspector',
  labelKey: 'editor.rail.edit',
  icon: SlidersHorizontal,
};
