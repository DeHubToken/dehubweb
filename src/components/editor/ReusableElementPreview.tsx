import { useEditorStore } from "@/store/editorStore";
import { useReusableElementPreview } from "@/lib/editor/useReusableElementPreview";
import type { ReusableDesignElement } from "@/lib/editor/reusableElements";
export function ReusableElementPreview({ element }: { element: ReusableDesignElement }) {
  const projectId = useEditorStore(store => store.projectId), image = useReusableElementPreview(projectId, element);
  return <div aria-hidden="true" className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">{image ? <img src={image} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-white/35">{element.source.layers.length}</span>}</div>;
}
