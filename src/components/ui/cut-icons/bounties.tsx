import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutBounties", ({ weight, maskId }) => <>
<path d="M4 10H21Q28 10 28 17V28H11Q4 28 4 21Z M11 10V5H17Q21 5 21 9V10 M4 17Q16 24 28 17" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M14.8000 19.3920L14.8000 23.0000L15.8080 23.0000Q17.2000 23.0000 17.2000 21.6080L17.2000 18.0000L16.1920 18.0000Q14.8000 18.0000 14.8000 19.3920Z" fill="currentColor" fillRule="evenodd"/>
</>);
