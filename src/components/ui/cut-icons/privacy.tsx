import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutPrivacy", ({ weight, maskId }) => <>
<path d="M7 14H20Q26 14 26 20V28H12Q7 28 7 23Z M11 14V9Q11 3 16.5 3Q22 3 22 9V14" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M15.3000 20.3920L15.3000 23.0000L16.3080 23.0000Q17.7000 23.0000 17.7000 21.6080L17.7000 19.0000L16.6920 19.0000Q15.3000 19.0000 15.3000 20.3920Z" fill="currentColor" fillRule="evenodd"/>
</>);
