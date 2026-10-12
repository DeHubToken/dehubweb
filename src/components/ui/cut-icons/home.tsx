import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutHome", ({ weight, maskId }) => <>
<path d="M6 14L16 5L26 14V24Q26 27 23 27H20V19H12V27H9Q6 27 6 24Z" fill="inherit" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
