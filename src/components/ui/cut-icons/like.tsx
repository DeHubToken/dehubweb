import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutLike", ({ weight, maskId }) => <>
<path d="M10 27H21Q24 27 24.8 24L27 15Q27.5 12.5 25 12.5H19V8Q19 4 15 4L10 14Z" fill="inherit" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M3.8000 15.3920L3.8000 27.0000L4.8080 27.0000Q6.2000 27.0000 6.2000 25.6080L6.2000 14.0000L5.1920 14.0000Q3.8000 14.0000 3.8000 15.3920Z" fill="currentColor" fillRule="evenodd"/>
</>);
