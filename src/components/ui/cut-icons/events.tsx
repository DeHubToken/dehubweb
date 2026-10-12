import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutEvents", ({ weight, maskId }) => <>
<path d="M5 7H21Q27 7 27 13V27H11Q5 27 5 21Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M6.3920 15.2000L27.0000 15.2000L27.0000 14.1920Q27.0000 12.8000 25.6080 12.8000L5.0000 12.8000L5.0000 13.8080Q5.0000 15.2000 6.3920 15.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M9.8000 4.3920L9.8000 10.0000L10.8080 10.0000Q12.2000 10.0000 12.2000 8.6080L12.2000 3.0000L11.1920 3.0000Q9.8000 3.0000 9.8000 4.3920Z" fill="currentColor" fillRule="evenodd"/><path d="M19.8000 4.3920L19.8000 10.0000L20.8080 10.0000Q22.2000 10.0000 22.2000 8.6080L22.2000 3.0000L21.1920 3.0000Q19.8000 3.0000 19.8000 4.3920Z" fill="currentColor" fillRule="evenodd"/><path d="M11 19H15Q18 19 18 22V24H14Q11 24 11 21Z" fill="currentColor" fillRule="evenodd"/>
</>);
