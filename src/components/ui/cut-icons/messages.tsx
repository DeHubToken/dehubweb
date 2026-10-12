import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutMessages", ({ weight }) => <>
<path d="M5 6H21Q27 6 27 12V26L20 21H11Q5 21 5 15Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M11.4570 11.5250H21.3000V10.8320Q21.3000 9.8750 20.3430 9.8750H10.5000V10.5680Q10.5000 11.5250 11.4570 11.5250Z" fill="currentColor" fillRule="evenodd"/><path d="M11.4570 14.6250H18.2000V13.9320Q18.2000 12.9750 17.2430 12.9750H10.5000V13.6680Q10.5000 14.6250 11.4570 14.6250Z" fill="currentColor" fillRule="evenodd"/><path d="M11.4570 17.7250H21.3000V17.0320Q21.3000 16.0750 20.3430 16.0750H10.5000V16.7680Q10.5000 17.7250 11.4570 17.7250Z" fill="currentColor" fillRule="evenodd"/>
</>);
