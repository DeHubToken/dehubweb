import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutVolume", ({ weight, maskId }) => <>
<path d="M4 12H9L17 5V27L9 20H4Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M22 10Q28 16 22 22 M26 6Q35 16 26 26" fill="none" stroke="currentColor" strokeWidth={weight * 1.1} strokeLinejoin="round"/>
</>);
