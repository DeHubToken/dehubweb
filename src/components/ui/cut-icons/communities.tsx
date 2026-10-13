import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutCommunities", ({ weight }) => <>
<path d="M5 13V9Q5 5 9 5Q13 5 13 9V13Z M20 15V11Q20 7 23.5 7Q27 7 27 11V15Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M4.2000 26.6080L4.2000 19.2000L10.0000 19.2000L10.0000 18.1920Q10.0000 16.8000 8.6080 16.8000L1.8000 16.8000L1.8000 28.0000L2.8080 28.0000Q4.2000 28.0000 4.2000 26.6080Z" fill="currentColor" fillRule="evenodd"/><path d="M10 18Q18 18 18 26V28 M22 20Q29 20 29 27V28" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
