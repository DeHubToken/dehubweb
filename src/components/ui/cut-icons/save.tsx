import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutSave", ({ weight, maskId }) => <>
<path d="M8 5H17.5Q24 5 24 11.5V28L16 23L8 28Z" fill="inherit" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
