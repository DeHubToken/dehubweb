import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutRefresh", ({ weight, maskId }) => <>
<path d="M26 12A11 11 0 0 0 6 9 M6 20A11 11 0 0 0 26 23" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M24.8000 6.3920L24.8000 10.8000L19.0000 10.8000L19.0000 11.8080Q19.0000 13.2000 20.3920 13.2000L27.2000 13.2000L27.2000 5.0000L26.1920 5.0000Q24.8000 5.0000 24.8000 6.3920Z" fill="currentColor" fillRule="evenodd"/><path d="M7.2000 25.6080L7.2000 21.2000L13.0000 21.2000L13.0000 20.1920Q13.0000 18.8000 11.6080 18.8000L4.8000 18.8000L4.8000 27.0000L5.8080 27.0000Q7.2000 27.0000 7.2000 25.6080Z" fill="currentColor" fillRule="evenodd"/>
</>);
