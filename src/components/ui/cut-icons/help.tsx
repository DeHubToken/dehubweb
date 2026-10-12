import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutHelp", ({ weight, maskId }) => <>
<path d="M28 16A12 12 0 1 1 4 16A12 12 0 1 1 28 16Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2}/><path d="M12.3 12.6C12.3 8.5 19.7 8.5 19.7 12.6C19.7 15.2 16 15.4 16 18" fill="none" stroke="currentColor" strokeWidth={weight * 1.1}/><path d="M14.8 21H16Q17.2 21 17.2 22.2V23.4H16Q14.8 23.4 14.8 22.2Z" fill="currentColor"/>
</>);
