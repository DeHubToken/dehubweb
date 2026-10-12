import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutDislike", ({ weight, maskId }) => <>
<g transform="rotate(180 16 16)"><path d="M10 27V15L15 5H16Q19 5 19 8V13H26V20Q26 27 19 27Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M3.8 15H5Q6.2 15 6.2 16.4V27H5Q3.8 27 3.8 25.6Z" fill="currentColor" fillRule="evenodd"/></g>
</>);
