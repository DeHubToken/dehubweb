import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutMessages", ({ weight, maskId }) => <>
<path d="M5 6H21Q27 6 27 12V26L20 21H11Q5 21 5 15Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M11.2470 12.0750L22.0000 12.0750L22.0000 11.1720Q22.0000 9.9250 20.7530 9.9250L10.0000 9.9250L10.0000 10.8280Q10.0000 12.0750 11.2470 12.0750Z" fill="currentColor" fillRule="evenodd"/><path d="M11.2470 17.0750L18.5000 17.0750L18.5000 16.1720Q18.5000 14.9250 17.2530 14.9250L10.0000 14.9250L10.0000 15.8280Q10.0000 17.0750 11.2470 17.0750Z" fill="currentColor" fillRule="evenodd"/>
</>);
