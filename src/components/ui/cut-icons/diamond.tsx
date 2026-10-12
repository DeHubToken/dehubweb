import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutDiamond", ({ weight, maskId }) => <>
<path d="M9 5H22L28 13L16 28L4 13Z" fill="inherit" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M5.7470 14.0750L27.5000 14.0750L27.5000 13.1720Q27.5000 11.9250 26.2530 11.9250L4.5000 11.9250L4.5000 12.8280Q4.5000 14.0750 5.7470 14.0750Z" fill="currentColor" fillRule="evenodd"/><path d="M12 5L10 13L16 28L22 13L19 5" fill="none" stroke="currentColor" strokeWidth={weight * 1.075} strokeLinejoin="round"/>
</>);
