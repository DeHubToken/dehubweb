import type { ComponentProps } from "react";
import { Slider } from "@/components/ui/slider";
import { useEditorStore } from "@/store/editorStore";
import { useEditorControlGesture } from "./useEditorControlGesture";

export function EditorSlider(props: ComponentProps<typeof Slider>) {
  const selection = useEditorStore(s => s.selectedClipIds.join(","));
  const gesture = useEditorControlGesture(selection);
  return <Slider {...props}
    onPointerDownCapture={event => {
      if (!props.disabled && event.button === 0) gesture.begin();
      props.onPointerDownCapture?.(event);
    }}
    onKeyDownCapture={event => {
      if (!props.disabled && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(event.key)) gesture.begin();
      props.onKeyDownCapture?.(event);
    }}
    onBlur={event => { props.onBlur?.(event); gesture.finish(); }}
    onValueChange={value => gesture.change(() => props.onValueChange?.(value))}
    onValueCommit={value => gesture.change(() => props.onValueCommit?.(value))}
  />;
}
