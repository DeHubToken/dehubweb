import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutCommunities", ({ weight, maskId }) => <>
<path d="M5 5H9Q13 5 13 9Q13 13 9 13H5Z M20 7H23Q27 7 27 11Q27 15 23 15H20Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M4.2000 26.6080L4.2000 19.2000L10.0000 19.2000L10.0000 18.1920Q10.0000 16.8000 8.6080 16.8000L1.8000 16.8000L1.8000 28.0000L2.8080 28.0000Q4.2000 28.0000 4.2000 26.6080Z" fill="currentColor" fillRule="evenodd"/><path d="M10 18Q18 18 18 26V28 M22 20Q29 20 29 27V28" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
