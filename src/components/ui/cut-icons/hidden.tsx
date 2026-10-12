import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutHidden", ({ weight, maskId }) => <>
<defs ><mask id={maskId}><rect width="32" height="32" fill="white"/><path d="M3 3L29 29" stroke="black" strokeWidth={weight * 3.0}/></mask></defs><g mask={`url(#${maskId})`}><path d="M3 16Q8 6 16 6Q24 6 29 16Q24 26 16 26Q8 26 3 16Z M20 16A4 4 0 1 1 12 16A4 4 0 1 1 20 16Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/></g><path d="M4.1358 5.8328L27.1515 28.8485L27.8642 28.1358Q28.8485 27.1515 27.8642 26.1672L4.8485 3.1515L4.1358 3.8642Q3.1515 4.8485 4.1358 5.8328Z" fill="currentColor" fillRule="evenodd"/>
</>);
