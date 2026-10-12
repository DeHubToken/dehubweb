import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutCommand", ({ weight, maskId }) => <>
<path d="M4 5H11Q14 5 14 8V18H4Z M19 5H24Q28 5 28 9V12H19Z M4 23H10Q14 23 14 27H4Z M19 17H24Q28 17 28 21V27H19Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
