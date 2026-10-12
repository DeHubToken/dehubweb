import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutPrevious", ({ weight, maskId }) => <>
<g transform="translate(32 0) scale(-1 1)"><path d="M5 5L21 16L5 27Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M24.8000 6.3920L24.8000 27.0000L25.8080 27.0000Q27.2000 27.0000 27.2000 25.6080L27.2000 5.0000L26.1920 5.0000Q24.8000 5.0000 24.8000 6.3920Z" fill="currentColor" fillRule="evenodd"/></g>
</>);
