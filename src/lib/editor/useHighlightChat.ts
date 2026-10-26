import { useEffect, useRef, useState } from "react";
import { emptyHighlightChat, HighlightChatSession, type HighlightChatRuntime } from "./highlightChat";
import { EditorError } from "./editorError";

export function useHighlightChat(runtime: HighlightChatRuntime) {
  const latest = useRef(runtime); latest.current = runtime;
  const [state, setState] = useState(emptyHighlightChat);
  const [session] = useState(() => new HighlightChatSession({
    current: () => latest.current.current(),
    transcribe: (...args) => latest.current.transcribe(...args),
    plan: (...args) => latest.current.plan(...args),
    create: (...args) => latest.current.create(...args),
    visual: runtime.visual ? {
      sample: (...args) => {
        if (!latest.current.visual) throw new EditorError("copy.3a8cddad37d6", "Visual analysis unavailable");
        return latest.current.visual.sample(...args);
      },
      analyse: (...args) => {
        if (!latest.current.visual) throw new EditorError("copy.3a8cddad37d6", "Visual analysis unavailable");
        return latest.current.visual.analyse(...args);
      },
    } : undefined,
  }, setState));
  useEffect(() => () => session.dispose(), [session]);
  return [state, session] as const;
}
