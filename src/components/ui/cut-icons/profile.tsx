import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutProfile", ({ weight, maskId }) => <>
<path d="M11 5H15.5Q21 5 21 10Q21 15 15.5 15H11Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M5 28V19H18.5Q27 19 27 27V28H26Q24.6 28 24.6 26.6Q24.4 21.4 18.5 21.4H7.4V26.6Q7.4 28 6 28Z" fill="currentColor" fillRule="evenodd"/>
</>);
