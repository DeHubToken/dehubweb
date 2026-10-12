import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutGuide", ({ weight, maskId }) => <>
<path d="M4 8L12 4L21 8L28 4V25L21 29L12 25L4 29Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M11.0000 5.1600L11.0000 25.0000L11.8400 25.0000Q13.0000 25.0000 13.0000 23.8400L13.0000 4.0000L12.1600 4.0000Q11.0000 4.0000 11.0000 5.1600Z" fill="currentColor" fillRule="evenodd"/><path d="M20.0000 9.1600L20.0000 29.0000L20.8400 29.0000Q22.0000 29.0000 22.0000 27.8400L22.0000 8.0000L21.1600 8.0000Q20.0000 8.0000 20.0000 9.1600Z" fill="currentColor" fillRule="evenodd"/>
</>);
