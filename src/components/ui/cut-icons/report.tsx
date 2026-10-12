import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutReport", ({ weight, maskId }) => <>
<path d="M4.8000 5.3920L4.8000 29.0000L5.8080 29.0000Q7.2000 29.0000 7.2000 27.6080L7.2000 4.0000L6.1920 4.0000Q4.8000 4.0000 4.8000 5.3920Z" fill="currentColor" fillRule="evenodd"/><path d="M6 5H17.2Q22.8 5 22.8 10.6V17.8H11.6Q6 17.8 6 12.2" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
