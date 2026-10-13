import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutPacks", ({ weight }) => <>
<path d="M5 4H20Q28 4 28 12V28H13Q5 28 5 20Z M11 20Q16 26 22 20" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M10 10H12Q14 10 14 12V14H12Q10 14 10 12Z M20 10H22Q24 10 24 12V14H22Q20 14 20 12Z" fill="currentColor" fillRule="evenodd"/>
</>);
