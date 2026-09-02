/**
 * Creator Flow — what a node can ask the canvas to do.
 * ====================================================
 * Nodes are rendered by React Flow, not by the canvas component, so the
 * things they need from it (run me, am I read-only) come through context.
 */
import { createContext, useContext } from 'react';

export interface FlowActions {
  /** Price, pay for and run these generator nodes (and only these). */
  runNodes: (nodeIds: string[]) => void;
  /** The public viewer: nothing edits, nothing generates. */
  readOnly: boolean;
}

export const FlowActionsContext = createContext<FlowActions>({ runNodes: () => undefined, readOnly: false });

export const useFlowActions = () => useContext(FlowActionsContext);
export const useReadOnly = () => useContext(FlowActionsContext).readOnly;
