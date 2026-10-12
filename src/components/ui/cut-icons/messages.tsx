import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutMessages", ({ weight }) => <>
<path d="M5 6H21Q27 6 27 12V26L20 21H11Q5 21 5 15Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M10.9570 11.2250H22.0000V10.5320Q22.0000 9.5750 21.0430 9.5750H10.0000V10.2680Q10.0000 11.2250 10.9570 11.2250Z" fill="currentColor" fillRule="evenodd"/><path d="M10.9570 14.8250H18.5000V14.1320Q18.5000 13.1750 17.5430 13.1750H10.0000V13.8680Q10.0000 14.8250 10.9570 14.8250Z" fill="currentColor" fillRule="evenodd"/><path d="M10.9570 18.4250H22.0000V17.7320Q22.0000 16.7750 21.0430 16.7750H10.0000V17.4680Q10.0000 18.4250 10.9570 18.4250Z" fill="currentColor" fillRule="evenodd"/>
</>);
