import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutVisibility", ({ weight, maskId }) => <>
<path d="M3 16Q8 6 16 6Q24 6 29 16Q24 26 16 26Q8 26 3 16Z M20 16A4 4 0 1 1 12 16A4 4 0 1 1 20 16Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
