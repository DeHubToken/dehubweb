import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutPricing", ({ weight }) => <>
<path d="M4 5H15Q17 5 18.5 6.5L28 16L17 28L4 15Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M8 9H10Q12 9 12 11V13H10Q8 13 8 11Z" fill="currentColor" fillRule="evenodd"/>
</>);
