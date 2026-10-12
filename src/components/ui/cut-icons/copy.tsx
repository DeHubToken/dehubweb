import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutCopy", ({ weight, maskId }) => <>
<path d="M3 3H19.6Q21 3 21 4.4V5.4H5.4V21.6Q5.4 23 4 23H3Z" fill="currentColor"/><path d="M10 10H21Q27 10 27 16V28H16Q10 28 10 22Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
