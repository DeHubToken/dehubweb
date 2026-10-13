import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutPremium", ({ weight }) => <>
<path d="M4 8L10 14L16 4L22 14L28 8V23H10Q4 23 4 17Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M5 27H23Q28 27 28 29H10Q5 29 5 27Z" fill="currentColor" fillRule="evenodd"/>
</>);
