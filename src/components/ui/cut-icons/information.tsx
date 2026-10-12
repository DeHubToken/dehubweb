import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutInformation", ({ weight, maskId }) => <>
<path d="M4 4H17Q28 4 28 15V28H15Q4 28 4 17Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><g transform="translate(16 16) scale(0.7) translate(-16 -16)"><path d="M14.8 14.192V24.4H15.808Q17.2 24.4 17.2 23.008V12.8H16.192Q14.8 12.8 14.8 14.192Z" fill="currentColor" fillRule="evenodd"/><path d="M14.8 7.4H16Q17.2 7.4 17.2 8.6V10H16Q14.8 10 14.8 8.8Z" fill="currentColor" fillRule="evenodd"/></g>
</>);
