import { useEditorStore } from "@/store/editorStore";
import type { CloudDraftEditor } from "./cloudDraftController";

export const cloudDraftEditorStore:CloudDraftEditor={
  scope:()=>useEditorStore.getState().scopeVersion,
  current:()=>useEditorStore.getState().toSnapshot(),
  isEditing:()=>{const state=useEditorStore.getState();return state.editing||!state.isHistorySettled();},
  subscribe:changed=>useEditorStore.subscribe((next,before)=>{
    if(next.scopeVersion!==before.scopeVersion||next.projectId!==before.projectId||next.projectTitle!==before.projectTitle||next.tracks!==before.tracks||next.clips!==before.clips||next.settings!==before.settings||next.editing!==before.editing||next.past!==before.past||next.future!==before.future)changed();
  }),
  receive:(snapshot,key)=>useEditorStore.getState().applySharedSnapshot(snapshot,key),
};
