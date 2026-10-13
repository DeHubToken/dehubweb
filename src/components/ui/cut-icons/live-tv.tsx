import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutLiveTV", ({ weight }) => <>
<path d="M4 10H21Q28 10 28 17V27H11Q4 27 4 20Z M10 3L16 9L22 3" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M12 15L21 19L12 23Z" fill="currentColor" fillRule="evenodd"/>
</>);
