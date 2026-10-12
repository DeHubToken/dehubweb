import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutShorts", ({ weight, maskId }) => <>
  <defs><clipPath id={maskId}><path d="M5 3H21Q27 3 27 9V29H11Q5 29 5 23Z" /></clipPath></defs>
  <g clipPath={`url(#${maskId})`}>
    <path d="M10 3V29 M22 3V29 M10 16H22 M5 8H10 M22 8H27 M5 16H10 M22 16H27 M5 24H10 M22 24H27" fill="none" stroke="currentColor" strokeWidth={weight * 1.05} strokeLinecap="butt" strokeLinejoin="miter" />
  </g>
  <path d="M5 3H21Q27 3 27 9V29H11Q5 29 5 23Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round" />
</>);
