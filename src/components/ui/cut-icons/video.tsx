import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutVideo", ({ weight, maskId }) => <>
<path d="M4 7H15Q21 7 21 13V25H10Q4 25 4 19Z M21 13L28 9V24L21 20" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
