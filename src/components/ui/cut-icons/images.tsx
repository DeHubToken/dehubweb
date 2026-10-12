import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutImages", ({ weight, maskId }) => <>
<path d="M5 5H21Q27 5 27 11V27H11Q5 27 5 21Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M5 23L12 15L18 21L22 17L27 22" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M19 9H21Q23 9 23 11V13H21Q19 13 19 11Z" fill="currentColor" fillRule="evenodd"/>
</>);
