import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutSearch", ({ weight }) => <>
  <path d="M22.1 13.2A8.8 8.8 0 1 1 4.5 13.2A8.8 8.8 0 1 1 22.1 13.2Z" fill="none" fillRule="evenodd" stroke="currentColor" strokeWidth={weight * 1.45} strokeLinejoin="round"/><g transform="rotate(45 16 16)"><path d="M21.5 14.55H31.1V15.45Q31.1 17.45 29.1 17.45H21.5Z" fill="currentColor" fillRule="evenodd"/></g>
</>);
