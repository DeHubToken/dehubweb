import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutAppearance", ({ weight, maskId }) => <>
<path d="M27 20A12 12 0 1 1 12 4Q8 13 15 19Q20 23 27 20Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
