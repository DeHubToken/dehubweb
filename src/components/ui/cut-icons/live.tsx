import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutLive", ({ weight, maskId }) => <>
<path d="M13 12H16Q20 12 20 16V20H17Q13 20 13 16Z" fill="currentColor" fillRule="evenodd"/><path d="M10 9Q4 16 10 23 M23 9Q29 16 23 23 M6 5Q-2 16 6 27 M27 5Q35 16 27 27" fill="none" stroke="currentColor" strokeWidth={weight * 1.05} strokeLinejoin="round"/>
</>);
